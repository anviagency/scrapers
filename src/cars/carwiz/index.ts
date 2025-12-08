/**
 * Entry point for CarWiz scraper
 * Scrapes car listings from carwiz.co.il via GraphQL API
 * Only scrapes agency listings (all listings are from agencies)
 */

import * as dotenv from 'dotenv';
import { EvomiProxyManager } from '../../proxy/EvomiProxyManager';
import { ProxyStatusTracker } from '../../monitoring/ProxyStatusTracker';
import { ActivityLogger } from '../../monitoring/ActivityLogger';
import { HttpClient } from '../../http/HttpClient';
import { CarWizScraper } from './CarWizScraper';
import { CarWizDatabaseManager } from '../../database/carwiz/CarWizDatabaseManager';
import { createLogger } from '../../utils/logger';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  const logger = createLogger('CarWizScraper');

  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('CARWIZ SCRAPER STARTING (GraphQL API)');
    logger.info('═══════════════════════════════════════════════════════');

    // Initialize monitoring components
    const activityLogger = ActivityLogger.getInstance(logger);
    const proxyStatusTracker = new ProxyStatusTracker(logger);

    // ENABLE PROXY - Required to avoid blocking
    const proxyKey = process.env.EVOMI_PROXY_KEY || '';
    const proxyEndpoint = process.env.EVOMI_PROXY_ENDPOINT;
    const proxyManager = new EvomiProxyManager(proxyKey, logger, proxyEndpoint, proxyStatusTracker);
    
    if (proxyKey) {
      logger.info('Using PROXY - required to avoid blocking', {
        proxyEndpoint: proxyEndpoint || 'default',
      });
      proxyStatusTracker.setEnabled(true);
    } else {
      logger.warn('No proxy key found - scraping may be blocked');
      proxyStatusTracker.setEnabled(false);
    }

    // Initialize HTTP client
    const httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: parseInt(process.env.CARWIZ_RATE_LIMIT_MS || '1000', 10),
      maxRetries: 3,
      retryDelayMs: 2000,
      useProxy: !!proxyKey, // Enable proxy if key is provided
      source: 'carwiz',
      activityLogger,
    });

    // Initialize database
    const dbPath = path.join(process.cwd(), 'data', 'carwiz.db');
    const database = new CarWizDatabaseManager(dbPath, logger);

    // Create scraping session
    const sessionId = database.createScrapingSession();
    logger.info('Created scraping session', { sessionId });

    // Initialize scraper (now uses GraphQL internally)
    const scraper = new CarWizScraper(
      httpClient,
      logger,
      database,
      activityLogger,
      parseInt(process.env.CARWIZ_BATCH_SIZE || '50', 10) // Default batch size: 50
    );

    // Start scraping - NO LIMITS, uses GraphQL pagination
    logger.info('Starting CarWiz scraper via GraphQL API - scraping all agency listings');

    const result = await scraper.scrapeAll({
      sessionId,
      batchSize: parseInt(process.env.CARWIZ_BATCH_SIZE || '50', 10),
    });

    // Update session as completed
    database.updateScrapingSession(sessionId, {
      status: 'completed',
      pagesScraped: result.totalPages,
      listingsFound: result.totalListings,
    });

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('CARWIZ SCRAPER COMPLETED SUCCESSFULLY');
    logger.info(`   Total listings: ${result.totalListings}`);
    logger.info(`   Total batches: ${result.totalPages}`);
    logger.info('═══════════════════════════════════════════════════════');

    // Close database connection
    database.close();
  } catch (error) {
    logger.error('CarWiz scraper failed', {
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
