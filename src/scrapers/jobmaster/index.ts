import * as dotenv from 'dotenv';
import { HttpClient } from '../../http/HttpClient';
import { EvomiProxyManager } from '../../proxy/EvomiProxyManager';
import { JobMasterParser } from './JobMasterParser';
import { JobMasterPaginationManager } from './JobMasterPaginationManager';
import { DataExporter } from '../../export/DataExporter';
import { createLogger } from '../../utils/logger';
import { JobMasterScraper } from './JobMasterScraper';
import { MultiCategoryScraper } from './MultiCategoryScraper';
import { JobMasterDatabaseManager } from '../../database/jobmaster/JobMasterDatabaseManager';
import { validateJobMasterConfig, type JobMasterConfig } from '../../types/MultiSourceConfig';
import * as path from 'path';

/**
 * Main entry point for JobMaster scraper
 */
async function main(): Promise<void> {
  // Load environment variables
  dotenv.config();

  // Load and validate configuration
  const config: JobMasterConfig = {
    baseUrl: process.env.JOBMASTER_BASE_URL || 'https://www.jobmaster.co.il',
    evomiProxyKey: process.env.EVOMI_PROXY_KEY || '',
    evomiProxyEndpoint: process.env.EVOMI_PROXY_ENDPOINT,
    rateLimitDelayMs: parseInt(process.env.JOBMASTER_RATE_LIMIT_DELAY_MS || '100', 10), // EXTREME: Reduced to 100ms for maximum speed
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
    logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
    maxPages: process.env.JOBMASTER_MAX_PAGES ? parseInt(process.env.JOBMASTER_MAX_PAGES, 10) : undefined,
    resumeFromPage: process.env.RESUME_FROM_PAGE ? parseInt(process.env.RESUME_FROM_PAGE, 10) : undefined,
  };

  const validationResult = validateJobMasterConfig(config);
  if (!validationResult.success) {
    console.error('Invalid configuration:', validationResult.error);
    process.exit(1);
  }

  // Initialize components
  const logger = createLogger(config.logLevel);
  const proxyManager = new EvomiProxyManager(config.evomiProxyKey, logger, config.evomiProxyEndpoint);
  const httpClient = new HttpClient(proxyManager, logger, {
    rateLimitDelayMs: config.rateLimitDelayMs,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
  });
  const parser = new JobMasterParser(logger, config.baseUrl);
  const paginationManager = new JobMasterPaginationManager(config.baseUrl, logger);
  const exporter = new DataExporter(path.join(process.cwd(), 'output'), logger);

  // Initialize database
  const dbPath = path.join(process.cwd(), 'data', 'jobmaster.db');
  const database = new JobMasterDatabaseManager(dbPath, logger);

  // Create scraper
  // JobMaster jobs are at /jobs/ endpoint
  // Based on analysis: 
  // - /jobs/ or /jobs/?q= returns empty page (no results)
  // - /jobs/?q=* returns ALL jobs (388+ jobs found in testing)
  // - Using "*" as wildcard query seems to return all available jobs
  // Default: use "/jobs/?q=*" to get all jobs
  const startUrl = process.env.JOBMASTER_START_URL || `${config.baseUrl}/jobs/?q=*`;
  const scraper = new JobMasterScraper(
    httpClient,
    parser,
    paginationManager,
    exporter,
    logger,
    startUrl,
    database
  );

  // Set max pages if configured
  if (config.maxPages) {
    paginationManager.setMaxPages(config.maxPages);
  }

  // Use multi-category scraper to get all jobs from different categories
  const useMultiCategory = process.env.JOBMASTER_USE_MULTI_CATEGORY !== 'false';
  
  if (useMultiCategory) {
    logger.info('Starting JobMaster multi-category scraper', {
      maxPagesPerCategory: config.maxPages || 200,
    });

    try {
      const sessionId = database.createScrapingSession();

      const multiCategoryScraper = new MultiCategoryScraper(
        httpClient,
        parser,
        paginationManager,
        exporter,
        logger,
        database,
        config.baseUrl
      );

      // Set session ID for incremental updates
      multiCategoryScraper.setSessionId(sessionId);

      const result = await multiCategoryScraper.scrapeAllCategories({
        maxPagesPerCategory: config.maxPages || 200, // Increased to 200 for comprehensive coverage
        maxConsecutiveEmptyPages: 20, // Increased to 20 - don't stop on gaps
      });

      // Update session
      database.updateScrapingSession(sessionId, {
        pagesScraped: result.totalPagesScraped,
        jobsFound: result.totalJobsFound,
        status: 'completed',
      });

      logger.info('Multi-category scraping completed', {
        totalCategories: result.totalCategoriesScraped,
        totalPages: result.totalPagesScraped,
        totalJobs: result.totalJobsFound,
      });

      // Get final count from database
      const finalCount = database.getJobsCount();
      logger.info('Final job count in database', { count: finalCount });

      database.close();
    } catch (error) {
      logger.error('Multi-category scraping failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      database.close();
      process.exit(1);
    }
  } else {
    // Original single-category scraper
    logger.info('Starting JobMaster scraper', {
      startUrl,
      maxPages: config.maxPages,
      resumeFromPage: config.resumeFromPage,
    });

    try {
      const sessionId = database.createScrapingSession();

      const result = await scraper.scrape({
        maxPages: config.maxPages,
        resumeFromPage: config.resumeFromPage,
        exportResults: true,
        exportFilename: 'jobmaster-scrape',
      });

      // Update session
      database.updateScrapingSession(sessionId, {
        pagesScraped: result.totalPagesScraped,
        jobsFound: result.totalJobsFound,
        status: 'completed',
      });

      logger.info('Scraping completed', {
        totalPages: result.totalPagesScraped,
        totalJobs: result.totalJobsFound,
        exportPaths: result.exportPaths,
      });

      // Get final count from database
      const finalCount = database.getJobsCount();
      logger.info('Final job count in database', { count: finalCount });

      database.close();
    } catch (error) {
      logger.error('Scraping failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      database.close();
      process.exit(1);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };

