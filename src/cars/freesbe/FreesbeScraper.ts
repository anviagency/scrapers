import type { HttpClient } from '../../http/HttpClient';
import type { FreesbeParser } from './FreesbeParser';
import type { Logger } from '../../utils/logger';
import type { FreesbeListing } from '../../types/FreesbeListing';
import type { FreesbeDatabaseManager } from '../../database/freesbe/FreesbeDatabaseManager';
import type { ActivityLogger } from '../../monitoring/ActivityLogger';
import * as cheerio from 'cheerio';

/**
 * Scraping options for Freesbe scraper
 */
export interface FreesbeScrapingOptions {
  maxPages?: number;
  sessionId?: number;
}

/**
 * Freesbe Scraper
 * Scrapes aggregated car listing data from freesbe.com
 * Only extracts data visible on listing cards, without accessing detail pages
 */
export class FreesbeScraper {
  private readonly httpClient: HttpClient;
  private readonly parser: FreesbeParser;
  private readonly logger: Logger;
  private readonly database: FreesbeDatabaseManager;
  private readonly activityLogger?: ActivityLogger;
  private readonly baseUrl: string = 'https://freesbe.com';
  private readonly scrapedCarIds: Set<string> = new Set();

  constructor(
    httpClient: HttpClient,
    parser: FreesbeParser,
    logger: Logger,
    database: FreesbeDatabaseManager,
    activityLogger?: ActivityLogger
  ) {
    this.httpClient = httpClient;
    this.parser = parser;
    this.logger = logger;
    this.database = database;
    this.activityLogger = activityLogger;
  }

  /**
   * Scrapes all car listings (aggregated data only)
   */
  async scrapeAll(options: FreesbeScrapingOptions = {}): Promise<{
    totalListings: number;
    totalPages: number;
  }> {
    const { maxPages, sessionId } = options; // No default limit - scrape until done

    let totalPages = 0;
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmptyPages = 3;

    // Track initial database count for accurate progress
    const initialDbCount = this.database.getListingsCount();
    this.logger.info('Starting Freesbe scraping', {
      maxPages: maxPages || 'unlimited',
      initialDatabaseCount: initialDbCount,
    });

    while ((!maxPages || currentPage <= maxPages) && consecutiveEmptyPages < maxConsecutiveEmptyPages) {
      try {
        const pageUrl = this.getPageUrl(currentPage);
        
        this.logger.debug(`Fetching page ${currentPage}`, { pageUrl });
        
        const response = await this.httpClient.get(pageUrl);
        const html = response.data;

        // Parse listings from page (aggregated data only)
        const listings = this.parser.parseListings(html, pageUrl);
        
        // Log parsing activity
        if (this.activityLogger) {
          this.activityLogger.logParsing('freesbe', 'used-car-for-sale', currentPage, listings.length);
        }

        // Filter duplicates
        const newListings: FreesbeListing[] = [];
        for (const listing of listings) {
          if (!this.scrapedCarIds.has(listing.carId)) {
            this.scrapedCarIds.add(listing.carId);
            newListings.push(listing);
          }
        }

        // Save to database
        if (newListings.length > 0) {
          const saved = this.database.upsertListings(newListings);
          
          // Log database activity
          if (this.activityLogger) {
            this.activityLogger.logDatabase('freesbe', 'upsert', saved);
          }

          this.logger.info(`Page ${currentPage}: Found ${listings.length} listings, ${newListings.length} new, ${saved} saved`, {
            page: currentPage,
            totalFound: listings.length,
            newListings: newListings.length,
            saved,
          });

          consecutiveEmptyPages = 0;
        } else {
          consecutiveEmptyPages++;
          this.logger.debug(`Page ${currentPage}: No new listings`, {
            page: currentPage,
            consecutiveEmptyPages,
          });
        }

        // Check if there are more pages
        if (!this.hasMorePages(html, currentPage)) {
          this.logger.info('No more pages found', { currentPage });
          break;
        }

        totalPages++;
        currentPage++;

        // Update session
        if (sessionId) {
          const currentDbCount = this.database.getListingsCount();
          const listingsFoundInSession = currentDbCount - initialDbCount;
          this.database.updateScrapingSession(sessionId, {
            pagesScraped: totalPages,
            listingsFound: listingsFoundInSession,
            status: 'running',
          });
        }

        // Rate limiting delay
        await this.delay(1000);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error scraping page ${currentPage}`, {
          error: errorMessage,
          page: currentPage,
        });
        
        // Log error activity
        if (this.activityLogger) {
          this.activityLogger.logError('freesbe', errorMessage, {
            page: currentPage,
          });
        }
        
        consecutiveEmptyPages++;
        currentPage++;
        
        // Continue to next page
      }
    }

    // Get final REAL count from database
    const finalDbCount = this.database.getListingsCount();
    const totalNewListings = finalDbCount - initialDbCount;

    this.logger.info('Freesbe scraping completed', {
      totalListingsInDatabase: finalDbCount,
      newListingsAddedThisSession: totalNewListings,
      totalPages,
      uniqueListingsCollected: this.scrapedCarIds.size,
    });

    // Update session to completed
    if (sessionId) {
      this.database.updateScrapingSession(sessionId, {
        pagesScraped: totalPages,
        listingsFound: totalNewListings,
        status: 'completed',
      });
    }

    return { totalListings: totalNewListings, totalPages };
  }

  /**
   * Gets the URL for a specific page
   */
  private getPageUrl(page: number): string {
    if (page === 1) {
      return `${this.baseUrl}/used-car-for-sale/listings`;
    }
    return `${this.baseUrl}/used-car-for-sale/listings?page=${page}`;
  }

  /**
   * Checks if there are more pages by parsing pagination
   */
  private hasMorePages(html: string, currentPage: number): boolean {
    try {
      const $ = cheerio.load(html);
      // Look for pagination links or "גלו עוד מכוניות" button
      const $nextLink = $('a[href*="page="], button[class*="next"], a[class*="next"], button:contains("גלו עוד")');
      const hasNext = $nextLink.length > 0 && !$nextLink.first().prop('disabled');
      
      // Also check if current page number is less than max page number shown
      const pageNumbers = $('[class*="page"], [class*="pagination"]').text();
      const maxPageMatch = pageNumbers.match(/(\d+)/g);
      if (maxPageMatch) {
        const maxPage = Math.max(...maxPageMatch.map(n => parseInt(n, 10)));
        return currentPage < maxPage;
      }
      
      // Check for "גלו עוד מכוניות" button which indicates more listings
      const $loadMoreButton = $('button:contains("גלו עוד מכוניות")');
      if ($loadMoreButton.length > 0) {
        return true;
      }
      
      return hasNext;
    } catch (error) {
      this.logger.warn('Failed to check pagination', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true; // Assume there are more pages if we can't determine
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

