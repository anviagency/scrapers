/**
 * Entry point for Freesbe scraper
 * Scrapes aggregated car listing data from freesbe.com
 * Only extracts data visible on listing cards, without accessing detail pages
 */

import * as dotenv from 'dotenv';
import { EvomiProxyManager } from '../../proxy/EvomiProxyManager';
import { ProxyStatusTracker } from '../../monitoring/ProxyStatusTracker';
import { ActivityLogger } from '../../monitoring/ActivityLogger';
import { HttpClient } from '../../http/HttpClient';
import { FreesbeParser } from './FreesbeParser';
import { FreesbeScraper } from './FreesbeScraper';
import { FreesbeDatabaseManager } from '../../database/freesbe/FreesbeDatabaseManager';
import { createLogger } from '../../utils/logger';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  const logger = createLogger('FreesbeScraper');

  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('FREESBE SCRAPER STARTING');
    logger.info('═══════════════════════════════════════════════════════');

    // Initialize monitoring components
    const activityLogger = ActivityLogger.getInstance(logger);
    const proxyStatusTracker = new ProxyStatusTracker(logger);

    // DISABLE PROXY - Direct access works fine
    const proxyManager = new EvomiProxyManager('', logger, undefined, proxyStatusTracker); // Empty key = no proxy
    
    logger.info('Using DIRECT access (no proxy) - faster and more reliable');

    // Initialize HTTP client
    const httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: parseInt(process.env.FREESBE_RATE_LIMIT_MS || '1000', 10),
      maxRetries: 3,
      retryDelayMs: 2000,
      useProxy: false, // Explicitly disable proxy
      source: 'freesbe',
      activityLogger,
    });

    // Initialize database
    const dbPath = path.join(process.cwd(), 'data', 'freesbe.db');
    const database = new FreesbeDatabaseManager(dbPath, logger);

    // Create scraping session
    const sessionId = database.createScrapingSession();
    logger.info('Created scraping session', { sessionId });

    // Initialize parser and scraper
    const parser = new FreesbeParser(logger);
    const scraper = new FreesbeScraper(
      httpClient,
      parser,
      logger,
      database,
      activityLogger
    );

    // Start scraping - NO LIMITS
    logger.info('Starting Freesbe scraper - scraping aggregated data only');
    const maxPages = process.env.FREESBE_MAX_PAGES ? parseInt(process.env.FREESBE_MAX_PAGES, 10) : undefined;

    const result = await scraper.scrapeAll({
      maxPages,
      sessionId,
    });

    // Update session as completed
    database.updateScrapingSession(sessionId, {
      status: 'completed',
      pagesScraped: result.totalPages,
      listingsFound: result.totalListings,
    });

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('FREESBE SCRAPER COMPLETED SUCCESSFULLY');
    logger.info(`   Total listings: ${result.totalListings}`);
    logger.info(`   Total pages: ${result.totalPages}`);
    logger.info('═══════════════════════════════════════════════════════');

    // Close database connection
    database.close();
  } catch (error) {
    logger.error('Freesbe scraper failed', {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run scraper
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

