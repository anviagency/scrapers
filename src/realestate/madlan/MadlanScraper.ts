import type { MadlanGraphQLClient } from './MadlanGraphQLClient';
import type { MadlanGraphQLParser } from './MadlanGraphQLParser';
import type { MadlanImageExtractor } from './MadlanImageExtractor';
import type { MadlanDatabaseManager } from '../../database/madlan/MadlanDatabaseManager';
import type { Logger } from '../../utils/logger';
import type { MadlanListing } from '../../types/MadlanListing';
import type { MadlanProject } from '../../types/MadlanProject';
import { ListingType } from '../../types/MadlanListing';

/**
 * Scraping options
 */
export interface MadlanScrapingOptions {
  listingTypes?: ListingType[];
  downloadImages?: boolean;
  sessionId?: number;
}

/**
 * Scraping result
 */
export interface MadlanScrapingResult {
  listings: MadlanListing[];
  projects: MadlanProject[];
  totalListings: number;
  totalProjects: number;
  totalPages: number;
}

/**
 * Main scraper orchestrator for Madlan using GraphQL API
 * Based on the working implementation from real-estate-scraper
 */
export class MadlanScraper {
  private readonly graphQLClient: MadlanGraphQLClient;
  private readonly parser: MadlanGraphQLParser;
  private readonly database: MadlanDatabaseManager;
  private readonly logger: Logger;
  private readonly scrapedListingIds: Set<string> = new Set();
  private readonly scrapedProjectIds: Set<string> = new Set();
  private readonly limitPerPage = 100; // Same as the working implementation

  constructor(
    graphQLClient: MadlanGraphQLClient,
    parser: MadlanGraphQLParser,
    _imageExtractor: MadlanImageExtractor,
    database: MadlanDatabaseManager,
    logger: Logger
  ) {
    this.graphQLClient = graphQLClient;
    this.parser = parser;
    this.database = database;
    this.logger = logger;
  }

  /**
   * Scrapes all listing types (sales, rentals, commercial) using GraphQL API
   * NO LIMITS - continues until all pages are scraped
   * 
   * @deprecated Use MadlanMultiRegionScraper.scrapeAllRegions() for multi-region scraping
   * This method is kept for backward compatibility but only scrapes without region filtering
   */
  async scrapeAllListings(options: MadlanScrapingOptions = {}): Promise<MadlanScrapingResult> {
    const listingTypes = options.listingTypes || [
      ListingType.SALE,
      ListingType.RENT,
      ListingType.COMMERCIAL,
    ];
    const downloadImages = options.downloadImages ?? false;
    const sessionId = options.sessionId;

    let totalListings = 0;
    let totalProjects = 0;
    let totalPages = 0;

    for (const listingType of listingTypes) {
      this.logger.info(`═══════════════════════════════════════════════════════`);
      this.logger.info(`🚀 STARTING CATEGORY: ${listingType.toUpperCase()}`);
      this.logger.info(`═══════════════════════════════════════════════════════`);

      let currentPage = 1;
      let consecutiveEmptyPages = 0;
      const maxConsecutiveEmptyPages = 10; // Stop after 10 empty pages

      while (true) {
        try {
          // Always log category and page number prominently
          if (currentPage % 10 === 0 || currentPage === 1) {
            this.logger.info(`📋 [${listingType.toUpperCase()}] Page ${currentPage} - Total so far: ${totalListings} listings`);
          } else {
            this.logger.info(`📋 [${listingType.toUpperCase()}] Page ${currentPage}`);
          }

          // Step 1: Search for POIs (get IDs)
          const searchResult = await this.graphQLClient.searchPoi(listingType, currentPage, this.limitPerPage);

          if (!searchResult.poi || searchResult.poi.length === 0) {
            consecutiveEmptyPages++;
            this.logger.warn(`⚠️  [${listingType.toUpperCase()}] Page ${currentPage}: Empty page (no POIs found) - Consecutive empty: ${consecutiveEmptyPages}/${maxConsecutiveEmptyPages}`);

            if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
              this.logger.warn(`🛑 [${listingType.toUpperCase()}] Stopping: ${maxConsecutiveEmptyPages} consecutive empty pages reached`);
              break;
            }

            currentPage++;
            totalPages++;
            continue;
          }

          consecutiveEmptyPages = 0;

          // Step 2: Get detailed information for each POI
          const poiIds = searchResult.poi.map(poi => ({
            type: poi.type === 'bulletin' || poi.type === 'CommercialBulletin' ? 'bulletin' : 'project',
            id: poi.id,
          }));

          // Process in batches to avoid overwhelming the API
          const batchSize = 50;
          const allListings: MadlanListing[] = [];
          const allProjects: MadlanProject[] = [];

          for (let i = 0; i < poiIds.length; i += batchSize) {
            const batch = poiIds.slice(i, i + batchSize);
            const poiDetails = await this.graphQLClient.getPoiByIds(batch);

            // Parse POI data
            const { listings, projects } = this.parser.parsePoiData(poiDetails, listingType);

            allListings.push(...listings);
            allProjects.push(...projects);
          }

          // Filter out duplicates
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

          if (newListings.length > 0 || newProjects.length > 0) {
            // Download images if requested
            if (downloadImages) {
              // Images are already parsed from GraphQL, but we can download them
              // Implementation depends on imageExtractor
              // TODO: Implement image downloading if needed
            }

            // Save to database
            const savedListings = newListings.length > 0 ? this.database.upsertListings(newListings) : 0;
            const savedProjects = newProjects.length > 0 ? this.database.upsertProjects(newProjects) : 0;

            totalListings += savedListings;
            totalProjects += savedProjects;

            this.logger.info(`✅ [${listingType.toUpperCase()}] Page ${currentPage}: Found ${allListings.length} listings, ${allProjects.length} projects | ${newListings.length} new listings, ${newProjects.length} new projects | Saved: ${savedListings} listings, ${savedProjects} projects | Total: ${totalListings} listings, ${totalProjects} projects`);
          } else {
            this.logger.info(`🔄 [${listingType.toUpperCase()}] Page ${currentPage}: Found ${allListings.length} listings, ${allProjects.length} projects (all duplicates)`);
          }

          totalPages++;

          // Update session if provided
          if (sessionId) {
            this.database.updateScrapingSession(sessionId, {
              pagesScraped: totalPages,
              listingsFound: totalListings,
              projectsFound: totalProjects,
              status: 'running',
            });
          }

          // Check if we've reached the end (total from search result)
          if (searchResult.total > 0 && currentPage * this.limitPerPage >= searchResult.total) {
            this.logger.info(`✅ [${listingType.toUpperCase()}] Reached end: ${searchResult.total} total POIs`);
            break;
          }

          currentPage++;
        } catch (error) {
          this.logger.error(`❌ [${listingType.toUpperCase()}] Error on page ${currentPage}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          consecutiveEmptyPages++;
          currentPage++;

          if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
            this.logger.warn(`🛑 [${listingType.toUpperCase()}] Stopping due to errors: ${maxConsecutiveEmptyPages} consecutive failures`);
            break;
          }
        }
      }

      this.logger.info(`═══════════════════════════════════════════════════════`);
      this.logger.info(`✅ COMPLETED CATEGORY: ${listingType.toUpperCase()}`);
      this.logger.info(`   Total listings: ${totalListings} | Total projects: ${totalProjects} | Total pages: ${totalPages}`);
      this.logger.info(`═══════════════════════════════════════════════════════`);
    }

    return {
      listings: [],
      projects: [],
      totalListings,
      totalProjects,
      totalPages,
    };
  }

  /**
   * Scrapes all projects (projects are included in scrapeAllListings)
   * This method is kept for compatibility but projects are scraped together with listings
   */
  async scrapeAllProjects(options: MadlanScrapingOptions = {}): Promise<MadlanScrapingResult> {
    // Projects are already scraped in scrapeAllListings
    // This method is kept for API compatibility
    return this.scrapeAllListings(options);
  }
}
