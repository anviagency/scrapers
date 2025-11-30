import { loadConfig } from './utils/validators';
import { createLogger } from './utils/logger';
import { EvomiProxyManager } from './proxy/EvomiProxyManager';
import { HttpClient } from './http/HttpClient';
import { JobListingParser } from './scraper/JobListingParser';
import { PaginationManager } from './scraper/PaginationManager';
import { DataExporter } from './export/DataExporter';
import { AllJobsScraper } from './scraper/AllJobsScraper';
import { DatabaseManager } from './database/Database';
import * as path from 'path';

/**
 * Main entry point for the AllJobs scraper
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();
    const logger = createLogger('alljobs-scraper');

    logger.info('Starting AllJobs scraper', {
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
      rateLimitDelayMs: config.rateLimitDelayMs,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
    });

    const parser = new JobListingParser(logger, config.baseUrl);
    const paginationManager = new PaginationManager(config.baseUrl, logger);

    const outputDir = path.join(process.cwd(), 'output');
    const exporter = new DataExporter(outputDir, logger);

    // Initialize database
    const dbPath = path.join(process.cwd(), 'data', 'alljobs.db');
    const db = new DatabaseManager(dbPath, logger);

    // Create scraping session
    const sessionId = db.createScrapingSession();

    // Create scraper with database for incremental saving
    const scraper = new AllJobsScraper(
      httpClient,
      parser,
      paginationManager,
      exporter,
      logger,
      db // Pass database to scraper for incremental saving
    );

    // Start scraping
    const result = await scraper.scrape({
      maxPages: config.maxPages,
      resumeFromPage: config.resumeFromPage,
      exportResults: false, // We'll save to DB instead
      exportFilename: 'alljobs-scrape',
    });

    // Jobs are already saved incrementally during scraping
    // Just update the final count and session status
    const finalCount = db.getJobsCount();
    logger.info('Final database count', { totalJobsInDatabase: finalCount });

    // Update scraping session
    db.updateScrapingSession(sessionId, {
      pagesScraped: result.totalPagesScraped,
      jobsFound: result.totalJobsFound,
      status: 'completed',
    });

    logger.info('Scraping completed successfully', {
      totalPagesScraped: result.totalPagesScraped,
      totalJobsFound: result.totalJobsFound,
      savedToDatabase: finalCount,
      sessionId,
    });

    console.log('\n=== Scraping Results ===');
    console.log(`Pages scraped: ${result.totalPagesScraped}`);
    console.log(`Jobs found: ${result.totalJobsFound}`);
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

