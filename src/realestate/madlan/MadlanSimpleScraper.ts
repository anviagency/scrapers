import type { MadlanGraphQLClient } from './MadlanGraphQLClient';
import type { MadlanGraphQLParser } from './MadlanGraphQLParser';
import type { MadlanDatabaseManager } from '../../database/madlan/MadlanDatabaseManager';
import type { Logger } from '../../utils/logger';
import type { ActivityLogger } from '../../monitoring/ActivityLogger';
import type { MadlanListing } from '../../types/MadlanListing';
import type { MadlanProject } from '../../types/MadlanProject';
import { ListingType } from '../../types/MadlanListing';

/**
 * Scraping result
 */
export interface MadlanScrapingResult {
  totalListings: number;
  totalProjects: number;
  totalPages: number;
}

/**
 * Simple scraper for Madlan
 * Scrapes ALL of Israel using tileRanges - no region filtering (more reliable)
 * NO LIMITS - continues until all pages are scraped
 */
export class MadlanSimpleScraper {
  private readonly graphQLClient: MadlanGraphQLClient;
  private readonly parser: MadlanGraphQLParser;
  private readonly database: MadlanDatabaseManager;
  private readonly logger: Logger;
  private readonly activityLogger?: ActivityLogger;
  private readonly scrapedListingIds: Set<string> = new Set();
  private readonly scrapedProjectIds: Set<string> = new Set();
  private readonly limitPerPage = 100;

  constructor(
    graphQLClient: MadlanGraphQLClient,
    parser: MadlanGraphQLParser,
    database: MadlanDatabaseManager,
    logger: Logger,
    activityLogger?: ActivityLogger
  ) {
    this.graphQLClient = graphQLClient;
    this.parser = parser;
    this.database = database;
    this.logger = logger;
    this.activityLogger = activityLogger;
  }

  /**
   * Scrapes all listing types for all of Israel
   * NO LIMITS - continues until all pages are scraped
   */
  async scrapeAll(
    sessionId?: number,
    listingTypes: ListingType[] = [ListingType.SALE, ListingType.RENT, ListingType.COMMERCIAL]
  ): Promise<MadlanScrapingResult> {
    this.logger.info('═══════════════════════════════════════════════════════');
    this.logger.info('STARTING MADLAN SCRAPER - ALL OF ISRAEL');
    this.logger.info(`   Listing types: ${listingTypes.join(', ')}`);
    this.logger.info('   NO LIMITS - will scrape until completion');
    this.logger.info('═══════════════════════════════════════════════════════');

    let totalListings = 0;
    let totalProjects = 0;
    let totalPages = 0;

    for (const listingType of listingTypes) {
      this.logger.info(`\n>>> Starting ${listingType.toUpperCase()} listings <<<`);

      const result = await this.scrapeListingType(listingType, sessionId);

      totalListings += result.listings;
      totalProjects += result.projects;
      totalPages += result.pages;

      this.logger.info(`>>> Completed ${listingType.toUpperCase()}: ${result.listings} listings, ${result.projects} projects <<<\n`);
    }

    this.logger.info('═══════════════════════════════════════════════════════');
    this.logger.info('MADLAN SCRAPING COMPLETED');
    this.logger.info(`   Total listings: ${totalListings}`);
    this.logger.info(`   Total projects: ${totalProjects}`);
    this.logger.info(`   Total pages: ${totalPages}`);
    this.logger.info('═══════════════════════════════════════════════════════');

    return {
      totalListings,
      totalProjects,
      totalPages,
    };
  }

  /**
   * Scrapes a specific listing type
   * NO LIMITS - continues until all pages are scraped
   */
  private async scrapeListingType(
    listingType: ListingType,
    sessionId?: number
  ): Promise<{ listings: number; projects: number; pages: number }> {
    let totalListings = 0;
    let totalProjects = 0;
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmptyPages = 5;
    let apiTotal = 0;

    while (true) {
      try {
        // Log progress every 5 pages
        if (currentPage % 5 === 0 || currentPage === 1) {
          this.logger.info(`[${listingType.toUpperCase()}] Page ${currentPage} | Total so far: ${totalListings} listings, ${totalProjects} projects`);
        }

        // Search for POIs
        const searchResult = await this.graphQLClient.searchPoi(
          listingType,
          currentPage,
          this.limitPerPage
        );

        if (currentPage === 1) {
          apiTotal = searchResult.total;
          this.logger.info(`[${listingType.toUpperCase()}] API reports ${apiTotal} total POIs`);
        }

        if (!searchResult.poi || searchResult.poi.length === 0) {
          consecutiveEmptyPages++;
          this.logger.debug(`[${listingType.toUpperCase()}] Empty page ${currentPage}, consecutive: ${consecutiveEmptyPages}`);
          
          if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
            this.logger.info(`[${listingType.toUpperCase()}] Stopping: ${maxConsecutiveEmptyPages} consecutive empty pages`);
            break;
          }
          currentPage++;
          continue;
        }

        consecutiveEmptyPages = 0;

        // Get detailed information for each POI
        const poiIds = searchResult.poi.map(poi => ({
          type: poi.type === 'bulletin' || poi.type === 'CommercialBulletin' ? 'bulletin' : 'project',
          id: poi.id,
        }));

        // Process in batches of 50
        const batchSize = 50;
        const allListings: MadlanListing[] = [];
        const allProjects: MadlanProject[] = [];

        for (let i = 0; i < poiIds.length; i += batchSize) {
          const batch = poiIds.slice(i, i + batchSize);
          const poiDetails = await this.graphQLClient.getPoiByIds(batch);
          const { listings, projects } = this.parser.parsePoiData(poiDetails, listingType);
          allListings.push(...listings);
          allProjects.push(...projects);
        }

        // Log parsing activity
        if (this.activityLogger) {
          this.activityLogger.logParsing('madlan', listingType, currentPage, allListings.length + allProjects.length);
        }

        // Filter out duplicates (globally tracked)
        const newListings = allListings.filter(
          listing => !this.scrapedListingIds.has(listing.listingId)
        );
        const newProjects = allProjects.filter(
          project => !this.scrapedProjectIds.has(project.projectId)
        );

        // Track scraped IDs
        newListings.forEach(listing => {
          this.scrapedListingIds.add(listing.listingId);
        });
        newProjects.forEach(project => {
          this.scrapedProjectIds.add(project.projectId);
        });

        // Save to database
        if (newListings.length > 0) {
          const savedListings = this.database.upsertListings(newListings);
          totalListings += savedListings;
          
          // Log database activity
          if (this.activityLogger) {
            this.activityLogger.logDatabase('madlan', 'upsertListings', savedListings);
          }
        }

        if (newProjects.length > 0) {
          const savedProjects = this.database.upsertProjects(newProjects);
          totalProjects += savedProjects;
          
          // Log database activity
          if (this.activityLogger) {
            this.activityLogger.logDatabase('madlan', 'upsertProjects', savedProjects);
          }
        }

        // Update session
        if (sessionId) {
          this.database.updateScrapingSession(sessionId, {
            pagesScraped: currentPage,
            listingsFound: totalListings,
            projectsFound: totalProjects,
            status: 'running',
          });
        }

        // Check if we've reached the end
        if (apiTotal > 0 && currentPage * this.limitPerPage >= apiTotal) {
          this.logger.info(`[${listingType.toUpperCase()}] Reached end: scraped up to ${currentPage * this.limitPerPage} of ${apiTotal} total POIs`);
          break;
        }

        currentPage++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`[${listingType.toUpperCase()}] Error on page ${currentPage}`, {
          error: errorMessage,
        });
        
        // Log error activity
        if (this.activityLogger) {
          this.activityLogger.logError('madlan', errorMessage, {
            listingType,
            page: currentPage,
          });
        }
        
        consecutiveEmptyPages++;
        
        if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
          this.logger.warn(`[${listingType.toUpperCase()}] Stopping due to errors`);
          break;
        }
        
        currentPage++;
      }
    }

    return {
      listings: totalListings,
      projects: totalProjects,
      pages: currentPage - 1,
    };
  }
}

