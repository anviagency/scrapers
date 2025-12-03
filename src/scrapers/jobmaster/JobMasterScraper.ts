import { BaseScraper } from '../base/BaseScraper';
import type { HttpClient } from '../../http/HttpClient';
import { JobMasterParser } from './JobMasterParser';
import { JobMasterPaginationManager } from './JobMasterPaginationManager';
import type { DataExporter } from '../../export/DataExporter';
import type { Logger } from '../../utils/logger';
import type { BaseDatabaseManager } from '../../database/base/BaseDatabaseManager';
import type { ScrapingOptions, ScrapingResult } from '../base/BaseScraper';
import type { JobMasterJobListing } from '../../types/JobMasterJobListing';

/**
 * Scraper for JobMaster.co.il
 * Extends BaseScraper with JobMaster-specific implementation
 */
export class JobMasterScraper extends BaseScraper {
  private readonly startUrl: string;

  /**
   * Creates a new JobMasterScraper instance
   * @param httpClient - HTTP client for making requests
   * @param parser - Parser for extracting job data from HTML
   * @param paginationManager - Manager for handling pagination
   * @param exporter - Exporter for saving results
   * @param logger - Logger instance
   * @param startUrl - Starting URL for scraping (e.g., search results page)
   * @param database - Optional database manager for incremental saving
   */
  constructor(
    httpClient: HttpClient,
    parser: JobMasterParser,
    paginationManager: JobMasterPaginationManager,
    exporter: DataExporter,
    logger: Logger,
    startUrl: string,
    database?: BaseDatabaseManager
  ) {
    super(httpClient, parser, paginationManager, exporter, logger, database);
    this.startUrl = startUrl;
  }

  /**
   * Gets the starting URL for scraping
   * @returns Starting URL
   */
  protected getStartingUrl(): string {
    return this.startUrl;
  }

  /**
   * Gets the rate limit delay in milliseconds
   * JobMaster-specific rate limiting
   * @returns Delay in milliseconds
   */
  protected getRateLimitDelay(): number {
    return 2500; // Default 2.5 seconds, can be overridden via config
  }

  /**
   * Scrapes job listings from JobMaster
   * Overrides base scrape method to ensure correct return type
   * @param options - Scraping options
   * @returns Promise resolving to scraping results with JobMasterJobListing[]
   */
  async scrape(options: ScrapingOptions = {}): Promise<ScrapingResult & { jobs: JobMasterJobListing[] }> {
    const result = await super.scrape(options);
    return {
      ...result,
      jobs: result.jobs as JobMasterJobListing[],
    };
  }
}

