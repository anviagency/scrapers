import type { HttpClient } from '../../http/HttpClient';
import type { Logger } from '../../utils/logger';
import type { CarWizDatabaseManager } from '../../database/carwiz/CarWizDatabaseManager';
import type { ActivityLogger } from '../../monitoring/ActivityLogger';
import { CarWizGraphQLClient } from './CarWizGraphQLClient';
import { CarWizGraphQLParser } from './CarWizGraphQLParser';

/**
 * Scraping options for CarWiz scraper
 */
export interface CarWizScrapingOptions {
  maxPages?: number; // Not used with GraphQL, but kept for compatibility
  sessionId?: number;
  batchSize?: number; // Number of listings per GraphQL request (default: 50)
}

/**
 * CarWiz Scraper using GraphQL API
 * Scrapes car listings from carwiz.co.il via GraphQL API
 * Only scrapes agency listings (all listings on the site are from agencies)
 */
export class CarWizScraper {
  private readonly graphQLClient: CarWizGraphQLClient;
  private readonly parser: CarWizGraphQLParser;
  private readonly logger: Logger;
  private readonly database: CarWizDatabaseManager;
  private readonly activityLogger?: ActivityLogger;
  private readonly batchSize: number;

  constructor(
    httpClient: HttpClient,
    logger: Logger,
    database: CarWizDatabaseManager,
    activityLogger?: ActivityLogger,
    batchSize: number = 50
  ) {
    this.graphQLClient = new CarWizGraphQLClient(httpClient, logger);
    this.parser = new CarWizGraphQLParser(logger);
    this.logger = logger;
    this.database = database;
    this.activityLogger = activityLogger;
    this.batchSize = batchSize;
  }

  /**
   * Scrapes all car listings using GraphQL API
   */
  async scrapeAll(options: CarWizScrapingOptions = {}): Promise<{
    totalListings: number;
    totalPages: number;
  }> {
    const { sessionId, batchSize = this.batchSize } = options;

    // Track initial database count for accurate progress
    const initialDbCount = this.database.getListingsCount();
    this.logger.info('Starting CarWiz scraping via GraphQL API', {
      batchSize,
      initialDatabaseCount: initialDbCount,
    });

    let totalListings = 0;
    let totalPages = 0;
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      try {
        this.logger.debug(`Fetching batch ${totalPages + 1}`, { after, batchSize });
        
        // Fetch listings from GraphQL API
        const response = await this.graphQLClient.fetchCarPosts(batchSize, after);
        const { nodes, pageInfo, totalCount } = response.data.carPosts;
        
        // Log HTTP activity
        if (this.activityLogger) {
          this.activityLogger.logParsing('carwiz', 'graphql-batch', totalPages + 1, nodes.length);
        }

        if (nodes.length === 0) {
          this.logger.info('No more listings found, stopping');
          break;
        }

        // Parse listings from GraphQL nodes
        const listings = this.parser.parseListings(nodes);
        
        // Filter out already scraped listings
        const newListings = listings.filter(listing => {
          const exists = this.database.getListingById(listing.carId);
          return !exists;
        });

        if (newListings.length > 0) {
          // Save to database
          const saved = this.database.upsertListings(newListings);
          
          // Log database activity
          if (this.activityLogger) {
            this.activityLogger.logDatabase('carwiz', 'upsert', saved);
          }

          this.logger.info(`Batch ${totalPages + 1}: Found ${listings.length} listings, ${newListings.length} new, ${saved} saved`, {
            batch: totalPages + 1,
            totalFound: listings.length,
            newListings: newListings.length,
            saved,
            totalCount,
          });

          totalListings += saved;
        } else {
          this.logger.debug(`Batch ${totalPages + 1}: All ${listings.length} listings already exist in database`);
        }

        totalPages++;

        // Update session after each batch
        if (sessionId) {
          const currentTotalJobs = this.database.getListingsCount();
          this.database.updateScrapingSession(sessionId, {
            pagesScraped: totalPages,
            listingsFound: currentTotalJobs,
            status: 'running',
          });
        }

        // Check if there are more pages
        hasNextPage = pageInfo.hasNextPage;
        after = pageInfo.endCursor;

        // Rate limiting delay between batches
        if (hasNextPage) {
          await this.delay(500); // 500ms delay between GraphQL requests
        }
      } catch (error) {
        this.logger.error(`Failed to scrape batch ${totalPages + 1}`, {
          error: error instanceof Error ? error.message : String(error),
          batch: totalPages + 1,
        });
        
        // Log error activity
        if (this.activityLogger) {
          this.activityLogger.logError('carwiz', `Failed to scrape batch ${totalPages + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Continue to next batch on error
        break;
      }
    }

    // Get final count
    const finalDbCount = this.database.getListingsCount();
    const totalNewListings = finalDbCount - initialDbCount;

    this.logger.info('CarWiz scraping completed', {
      totalBatches: totalPages,
      totalListingsFound: totalListings,
      totalNewListings,
      finalDatabaseCount: finalDbCount,
    });

    return {
      totalListings: totalNewListings,
      totalPages,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
