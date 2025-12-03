import type { HttpClient } from '../../http/HttpClient';
import type { BaseParser } from './BaseParser';
import type { DataExporter } from '../../export/DataExporter';
import type { Logger } from '../../utils/logger';
import type { BaseJobListing } from '../../types/BaseJobListing';
import type { BaseDatabaseManager } from '../../database/base/BaseDatabaseManager';

/**
 * Interface for pagination managers
 * Each source can have its own pagination implementation
 */
export interface IPaginationManager {
  getNextPageUrl(html: string, currentUrl: string, currentPage: number): string | null;
  hasNextPage(html: string, currentPage: number): boolean;
}

/**
 * Scraping options
 */
export interface ScrapingOptions {
  maxPages?: number;
  resumeFromPage?: number;
  exportResults?: boolean;
  exportFilename?: string;
}

/**
 * Scraping result
 */
export interface ScrapingResult {
  jobs: BaseJobListing[];
  totalPagesScraped: number;
  totalJobsFound: number;
  exportPaths?: {
    json: string;
    csv: string;
  };
}

/**
 * Abstract base class for scrapers
 * Each source-specific scraper should extend this class
 */
export abstract class BaseScraper {
  protected readonly httpClient: HttpClient;
  protected readonly parser: BaseParser;
  protected readonly paginationManager: IPaginationManager;
  protected readonly exporter: DataExporter;
  protected readonly logger: Logger;
  protected readonly database?: BaseDatabaseManager;

  /**
   * Creates a new BaseScraper instance
   * @param httpClient - HTTP client for making requests
   * @param parser - Parser for extracting job data from HTML
   * @param paginationManager - Manager for handling pagination
   * @param exporter - Exporter for saving results
   * @param logger - Logger instance
   * @param database - Optional database manager for incremental saving
   */
  constructor(
    httpClient: HttpClient,
    parser: BaseParser,
    paginationManager: IPaginationManager,
    exporter: DataExporter,
    logger: Logger,
    database?: BaseDatabaseManager
  ) {
    this.httpClient = httpClient;
    this.parser = parser;
    this.paginationManager = paginationManager;
    this.exporter = exporter;
    this.logger = logger;
    this.database = database;
  }

  /**
   * Gets the starting URL for scraping
   * Must be implemented by source-specific scrapers
   * @returns Starting URL
   */
  protected abstract getStartingUrl(): string;

  /**
   * Main scraping method
   * Template method pattern - defines the algorithm structure
   * @param options - Scraping options
   * @returns Scraping result
   */
  async scrape(options: ScrapingOptions = {}): Promise<ScrapingResult> {
    const startUrl = this.getStartingUrl();
    let currentUrl: string | null = startUrl;
    let currentPage = options.resumeFromPage || 1;
    const maxPages = options.maxPages || Infinity;
    const allJobs: BaseJobListing[] = [];
    const scrapedUrls = new Set<string>(); // Track scraped URLs to prevent infinite loops
    let consecutiveEmptyPages = 0; // Track consecutive pages with no jobs
    const maxConsecutiveEmptyPages = 10; // Stop after 10 empty pages (increased to handle sparse results and gaps)

    this.logger.info('Starting scraping', {
      startUrl,
      maxPages,
      resumeFromPage: options.resumeFromPage,
    });

    while (currentUrl && currentPage <= maxPages) {
      try {
        // Check if we've already scraped this URL (prevent infinite loops)
        if (scrapedUrls.has(currentUrl)) {
          this.logger.warn('Already scraped this URL, stopping to prevent infinite loop', {
            url: currentUrl,
            page: currentPage,
          });
          break;
        }

        scrapedUrls.add(currentUrl);

        this.logger.info(`Scraping page ${currentPage}`, { url: currentUrl });

        // Fetch page
        const response = await this.httpClient.get(currentUrl);
        const html = response.data;

        // Parse jobs from page
        const jobs = this.parser.parseJobListings(html, currentUrl);
        this.logger.info(`Found ${jobs.length} jobs on page ${currentPage}`);

        // Track empty pages - but be more lenient
        if (jobs.length === 0) {
          consecutiveEmptyPages++;
          this.logger.warn(`No jobs found on page ${currentPage}`, {
            consecutiveEmptyPages,
            maxConsecutiveEmptyPages,
            url: currentUrl,
          });

          // Stop if we've hit too many consecutive empty pages
          // Increased threshold to 10 pages to handle sites with sparse results and gaps
          if (consecutiveEmptyPages >= 10) {
            this.logger.warn('Too many consecutive empty pages, stopping scraping', {
              consecutiveEmptyPages,
              totalPagesScraped: currentPage - 1,
              totalJobsFound: allJobs.length,
            });
            break;
          }
        } else {
          consecutiveEmptyPages = 0; // Reset counter if we found jobs
        }

        // Save jobs to database incrementally if database is provided
        if (this.database && jobs.length > 0) {
          try {
            const saved = this.database.upsertJobs(jobs);
            this.logger.info('Saved jobs to database', {
              page: currentPage,
              jobsFound: jobs.length,
              saved,
            });
          } catch (error) {
            this.logger.error('Failed to save jobs to database', {
              page: currentPage,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        allJobs.push(...jobs);

        // Get next page URL
        const nextUrl = this.paginationManager.getNextPageUrl(html, currentUrl, currentPage);
        
        // Check if next URL is null or same as current (prevent infinite loops)
        if (!nextUrl) {
          this.logger.warn('No next page URL found, stopping', {
            url: currentUrl,
            page: currentPage,
            jobsFound: jobs.length,
          });
          break;
        }
        
        if (nextUrl === currentUrl) {
          this.logger.warn('Next page URL is the same as current URL, stopping', {
            url: currentUrl,
            page: currentPage,
          });
          break;
        }

        // Update URL and page number
        currentUrl = nextUrl;
        currentPage++;

        // Rate limiting delay
        if (currentUrl && currentPage <= maxPages) {
          await this.delay(this.getRateLimitDelay());
        }
      } catch (error) {
        this.logger.error(`Failed to scrape page ${currentPage}`, {
          url: currentUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    // Export results if requested
    // Note: Exporter expects specific types, so we cast here
    // Each source-specific scraper should handle its own export types
    let exportPaths: { json: string; csv: string } | undefined;
    if (options.exportResults && allJobs.length > 0) {
      const filename = options.exportFilename || 'scrape';
      // Cast to any to avoid type issues - exporter will handle validation
      exportPaths = await this.exporter.exportAll(allJobs as any, filename);
      this.logger.info('Exported results', { exportPaths });
    }

    return {
      jobs: allJobs,
      totalPagesScraped: currentPage - 1,
      totalJobsFound: allJobs.length,
      exportPaths,
    };
  }

  /**
   * Gets the rate limit delay in milliseconds
   * Can be overridden by source-specific scrapers
   * @returns Delay in milliseconds
   */
  protected getRateLimitDelay(): number {
    return 2500; // Default 2.5 seconds
  }

  /**
   * Utility method for delays
   * @param ms - Milliseconds to delay
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

