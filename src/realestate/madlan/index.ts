/**
 * Entry point for Madlan scraper
 * SIMPLIFIED: Uses tileRanges for all of Israel - more reliable
 * NO LIMITS - runs until all pages are scraped
 */

import * as dotenv from 'dotenv';
import { EvomiProxyManager } from '../../proxy/EvomiProxyManager';
import { ProxyStatusTracker } from '../../monitoring/ProxyStatusTracker';
import { ActivityLogger } from '../../monitoring/ActivityLogger';
import { HttpClient } from '../../http/HttpClient';
import { MadlanGraphQLClient } from './MadlanGraphQLClient';
import { MadlanGraphQLParser } from './MadlanGraphQLParser';
import { MadlanSimpleScraper } from './MadlanSimpleScraper';
import { MadlanDatabaseManager } from '../../database/madlan/MadlanDatabaseManager';
import { createLogger } from '../../utils/logger';
import * as path from 'path';
import { ListingType } from '../../types/MadlanListing';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  const logger = createLogger('MadlanScraper');

  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('MADLAN SCRAPER STARTING');
    logger.info('═══════════════════════════════════════════════════════');

    // Initialize monitoring components
    const activityLogger = ActivityLogger.getInstance(logger);
    const proxyStatusTracker = new ProxyStatusTracker(logger);

    // ENABLE PROXY - Required to avoid blocking and ensure complete scraping
    const proxyKey = process.env.EVOMI_PROXY_KEY || '';
    const proxyEndpoint = process.env.EVOMI_PROXY_ENDPOINT;
    const proxyManager = new EvomiProxyManager(proxyKey, logger, proxyEndpoint, proxyStatusTracker);
    
    if (proxyKey) {
      logger.info('Using PROXY - required to avoid blocking and ensure complete scraping', {
        proxyEndpoint: proxyEndpoint || 'default',
      });
      proxyStatusTracker.setEnabled(true);
    } else {
      logger.warn('No proxy key found - scraping may be blocked or incomplete');
      proxyStatusTracker.setEnabled(false);
    }

    // Initialize HTTP client
    const httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: parseInt(process.env.MADLAN_RATE_LIMIT_MS || '1000', 10), // Slower with proxy
      maxRetries: 3,
      retryDelayMs: 2000,
      useProxy: !!proxyKey, // Enable proxy if key is provided
      source: 'madlan',
      activityLogger,
    });

    // Initialize database
    const dbPath = path.join(process.cwd(), 'data', 'madlan.db');
    const database = new MadlanDatabaseManager(dbPath, logger);

    // Create scraping session
    const sessionId = database.createScrapingSession();
    logger.info('Created scraping session', { sessionId });

    // Initialize GraphQL components
    const graphQLClient = new MadlanGraphQLClient(httpClient, logger);
    const parser = new MadlanGraphQLParser(logger);
    
    // Use simple scraper - covers all of Israel with tileRanges (most reliable)
    const scraper = new MadlanSimpleScraper(
      graphQLClient,
      parser,
      database,
      logger,
      activityLogger
    );

    // Start scraping - NO LIMITS
    logger.info('Starting Madlan simple scraper - NO LIMITS');

    // TEMPORARY: Skip COMMERCIAL - GraphQL API doesn't support dealType: 'commercial'
    // TODO: Fix commercial support - may need different API endpoint or dealType value
    const result = await scraper.scrapeAll(
      sessionId,
      [ListingType.SALE, ListingType.RENT] // Removed COMMERCIAL until fixed
    );

    // Update session as completed
    database.updateScrapingSession(sessionId, {
      status: 'completed',
      pagesScraped: result.totalPages,
      listingsFound: result.totalListings,
      projectsFound: result.totalProjects,
    });

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('MADLAN SCRAPER COMPLETED SUCCESSFULLY');
    logger.info(`   Total listings: ${result.totalListings}`);
    logger.info(`   Total projects: ${result.totalProjects}`);
    logger.info(`   Total pages: ${result.totalPages}`);
    logger.info('═══════════════════════════════════════════════════════');

    // Close database connection
    database.close();
  } catch (error) {
    logger.error('Madlan scraper failed', {
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

