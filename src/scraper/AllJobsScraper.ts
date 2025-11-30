import type { HttpClient } from '../http/HttpClient';
import type { JobListingParser } from './JobListingParser';
import type { PaginationManager } from './PaginationManager';
import type { DataExporter } from '../export/DataExporter';
import type { Logger } from '../utils/logger';
import type { JobListing } from '../types/JobListing';
import type { DatabaseManager } from '../database/Database';

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
  jobs: JobListing[];
  totalPagesScraped: number;
  totalJobsFound: number;
  exportPaths?: {
    json: string;
    csv: string;
  };
}

/**
 * Main scraper orchestrator that coordinates all components
 */
export class AllJobsScraper {
  private readonly httpClient: HttpClient;
  private readonly parser: JobListingParser;
  private readonly paginationManager: PaginationManager;
  private readonly exporter: DataExporter;
  private readonly logger: Logger;
  private readonly database?: DatabaseManager;

  /**
   * Creates a new AllJobsScraper instance
   * @param httpClient - HTTP client for making requests
   * @param parser - Parser for extracting job data from HTML
   * @param paginationManager - Manager for handling pagination
   * @param exporter - Exporter for saving results
   * @param logger - Logger instance
   */
  constructor(
    httpClient: HttpClient,
    parser: JobListingParser,
    paginationManager: PaginationManager,
    exporter: DataExporter,
    logger: Logger,
    database?: DatabaseManager
  ) {
    this.httpClient = httpClient;
    this.parser = parser;
    this.paginationManager = paginationManager;
    this.exporter = exporter;
    this.logger = logger;
    this.database = database;
  }

  /**
   * Scrapes job listings from alljobs.co.il
   * @param options - Scraping options
   * @returns Promise resolving to scraping results
   */
  async scrape(options: ScrapingOptions = {}): Promise<ScrapingResult> {
    const {
      maxPages,
      resumeFromPage = 1,
      exportResults = false,
      exportFilename = 'alljobs-scrape',
    } = options;

    this.logger.info('Starting scraping', {
      maxPages,
      resumeFromPage,
      exportResults,
    });

    const allJobs: JobListing[] = [];
    let currentPage = resumeFromPage;
    let pagesScraped = 0;

    // Set max pages limit if provided
    if (maxPages) {
      this.paginationManager.setMaxPages(maxPages);
    }

    try {
      while (true) {
        // Check if we've exceeded max pages
        if (maxPages && currentPage > maxPages) {
          this.logger.info('Reached max pages limit', {
            currentPage,
            maxPages,
          });
          break;
        }

        // Check if pagination manager says we've exceeded max
        if (this.paginationManager.exceedsMaxPages(currentPage)) {
          this.logger.info('Exceeded max pages limit', { currentPage });
          break;
        }

        this.logger.info('Scraping page', { page: currentPage });

        try {
          // Get page URL
          const pageUrl = this.paginationManager.getPageUrl(currentPage);

          // Fetch page content
          const response = await this.httpClient.get(pageUrl);
          const html = response.data;

          // Parse job listings from HTML
          const jobs = this.parser.parseJobListings(html, pageUrl);
          allJobs.push(...jobs);

          this.logger.info('Scraped page', {
            page: currentPage,
            jobsFound: jobs.length,
            totalJobs: allJobs.length,
          });

          // Save jobs to database incrementally if database is provided
          if (this.database && jobs.length > 0) {
            try {
              const saved = this.database.upsertJobs(jobs);
              this.logger.info('✅ Saved jobs to database', {
                page: currentPage,
                jobsFound: jobs.length,
                saved,
              });
            } catch (error) {
              this.logger.error('❌ Failed to save jobs to database', {
                page: currentPage,
                jobsFound: jobs.length,
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
              });
            }
          } else if (!this.database) {
            this.logger.warn('⚠️ Database not provided - jobs will not be saved incrementally', {
              page: currentPage,
            });
          }

          pagesScraped++;

          // Check for next page
          const nextPage = this.paginationManager.getNextPageNumber(
            html,
            currentPage
          );

          if (nextPage === null) {
            this.logger.info('No more pages to scrape', {
              lastPage: currentPage,
            });
            break;
          }

          currentPage = nextPage;
        } catch (error) {
          this.logger.error('Error scraping page', {
            page: currentPage,
            error: error instanceof Error ? error.message : String(error),
          });

          // Continue to next page on error, but log it
          currentPage++;
          if (maxPages && currentPage > maxPages) {
            break;
          }
        }
      }

      // Remove duplicates based on jobId
      const uniqueJobs = this.removeDuplicates(allJobs);

      this.logger.info('Scraping completed', {
        totalPagesScraped: pagesScraped,
        totalJobsFound: uniqueJobs.length,
        duplicatesRemoved: allJobs.length - uniqueJobs.length,
      });

      const result: ScrapingResult = {
        jobs: uniqueJobs,
        totalPagesScraped: pagesScraped,
        totalJobsFound: uniqueJobs.length,
      };

      // Export results if requested
      if (exportResults && uniqueJobs.length > 0) {
        try {
          const exportPaths = await this.exporter.exportAll(
            uniqueJobs,
            exportFilename
          );
          result.exportPaths = exportPaths;
          this.logger.info('Results exported', { exportPaths });
        } catch (error) {
          this.logger.error('Failed to export results', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Scraping failed', {
        error: error instanceof Error ? error.message : String(error),
        pagesScraped,
        jobsCollected: allJobs.length,
      });
      throw error;
    }
  }

  /**
   * Removes duplicate job listings based on jobId
   * @param jobs - Array of job listings
   * @returns Array of unique job listings
   */
  private removeDuplicates(jobs: JobListing[]): JobListing[] {
    const seen = new Set<string>();
    const unique: JobListing[] = [];

    for (const job of jobs) {
      if (!seen.has(job.jobId)) {
        seen.add(job.jobId);
        unique.push(job);
      }
    }

    return unique;
  }

  /**
   * Gets scraping progress information
   * @returns Current progress stats
   */
  getProgress(): { pagesScraped: number; jobsCollected: number } {
    // This would need to be tracked during scraping
    // For now, return placeholder
    return {
      pagesScraped: 0,
      jobsCollected: 0,
    };
  }
}

