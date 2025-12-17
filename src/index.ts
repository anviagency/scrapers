import { loadConfig } from './utils/validators';
import { createLogger } from './utils/logger';
import { EvomiProxyManager } from './proxy/EvomiProxyManager';
import { ProxyStatusTracker } from './monitoring/ProxyStatusTracker';
import { ActivityLogger } from './monitoring/ActivityLogger';
import { HttpClient } from './http/HttpClient';
import { JobListingParser } from './scraper/JobListingParser';
import { AllJobsMultiCategoryScraper } from './scraper/AllJobsMultiCategoryScraper';
import { AllJobsDatabaseManager } from './database/alljobs/AllJobsDatabaseManager';
import * as path from 'path';

/**
 * Main entry point for the AllJobs scraper
 * Uses multi-category scraping to ensure category information is captured
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();
    const logger = createLogger('alljobs-scraper');

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('ALLJOBS SCRAPER STARTING');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('Configuration', {
      baseUrl: config.baseUrl,
      maxRetries: config.maxRetries,
    });

    logger.info('Max pages', {
      maxPages: config.maxPages,
    });

    // Initialize monitoring components
    const activityLogger = ActivityLogger.getInstance(logger);
    const proxyStatusTracker = new ProxyStatusTracker(logger);

    // ENABLE PROXY - Required to avoid blocking and ensure complete scraping
    const proxyKey = process.env.EVOMI_PROXY_KEY || config.evomiProxyKey || '';
    const proxyEndpoint = process.env.EVOMI_PROXY_ENDPOINT || config.evomiProxyEndpoint;
    const proxyUsername = process.env.EVOMI_PROXY_USERNAME || config.evomiProxyUsername;
    const proxyPassword = process.env.EVOMI_PROXY_PASSWORD || config.evomiProxyPassword;
    const proxyManager = new EvomiProxyManager({
      proxyKey,
      logger,
      endpoint: proxyEndpoint,
      proxyStatusTracker,
      username: proxyUsername,
      password: proxyPassword,
    });

    if (proxyKey) {
      logger.info('Using PROXY - required to avoid blocking and ensure complete scraping', {
        proxyEndpoint: proxyEndpoint || 'default',
      });
      proxyStatusTracker.setEnabled(true);
    } else {
      logger.warn('No proxy key found - scraping may be blocked or incomplete');
      proxyStatusTracker.setEnabled(false);
    }

    const httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: 500, // Slower with proxy to avoid detection
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      useProxy: !!proxyKey, // Enable proxy if key is provided
      source: 'alljobs',
      activityLogger,
    });

    const parser = new JobListingParser(logger, config.baseUrl);

    // Initialize database
    const dbPath = path.join(process.cwd(), 'data', 'alljobs.db');
    const db = new AllJobsDatabaseManager(dbPath, logger);

    // Create scraping session
    const sessionId = db.createScrapingSession();

    // Create multi-category scraper
    const scraper = new AllJobsMultiCategoryScraper(
      httpClient,
      parser,
      logger,
      db,
      activityLogger
    );

    // Start scraping all categories
    // Use MAX_PAGES env var to limit pages per category, default to 10000 (effectively unlimited)
    const result = await scraper.scrapeAllCategories({
      maxPagesPerCategory: config.maxPages || 10000,
      sessionId,
      fetchJobDetails: true,
    });

    // Get final count
    const finalCount = db.getJobsCount();
    logger.info('Final database count', { totalJobsInDatabase: finalCount });

    // Update scraping session
    db.updateScrapingSession(sessionId, {
      pagesScraped: result.totalPages,
      jobsFound: result.totalJobs,
      status: 'completed',
    });

    logger.info('Scraping completed successfully', {
      totalPagesScraped: result.totalPages,
      totalJobsFound: result.totalJobs,
      categoriesScraped: result.categoriesScraped,
      savedToDatabase: finalCount,
      sessionId,
    });

    console.log('\n=== Scraping Results ===');
    console.log(`Categories scraped: ${result.categoriesScraped}`);
    console.log(`Pages scraped: ${result.totalPages}`);
    console.log(`Jobs found: ${result.totalJobs}`);
    console.log(`Jobs in database: ${finalCount}`);
    console.log(`Database location: ${dbPath}`);
    console.log(`\n💡 Start API server with: npm run api`);
    console.log(`   Then visit: http://localhost:3000/api/jobs`);

    // Close database connection
    db.close();
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
