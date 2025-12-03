import { loadConfig } from './utils/validators';
import { createLogger } from './utils/logger';
import { EvomiProxyManager } from './proxy/EvomiProxyManager';
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

    logger.info('Starting AllJobs Multi-Category Scraper', {
      baseUrl: config.baseUrl,
      maxRetries: config.maxRetries,
      rateLimitDelayMs: config.rateLimitDelayMs,
    });

    // Initialize components
    const proxyManager = new EvomiProxyManager(
      config.evomiProxyKey,
      logger,
      config.evomiProxyEndpoint
    );

    // Validate proxy
    const proxyValid = await proxyManager.validateProxy();
    if (!proxyValid) {
      logger.warn('Proxy validation failed, continuing anyway');
    }

    const httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: 100, // FAST: Reduced to 100ms for maximum speed (same as JobMaster)
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
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
      db
    );

    // Start scraping all categories
    // NO LIMIT: Set to 10000 to ensure we get ALL jobs from each category
    const result = await scraper.scrapeAllCategories({
      maxPagesPerCategory: config.maxPages || 10000,
      sessionId,
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
