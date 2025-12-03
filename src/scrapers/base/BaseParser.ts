import type { Logger } from '../../utils/logger';
import type { BaseJobListing } from '../../types/BaseJobListing';

/**
 * Abstract base class for parsing job listings from HTML
 * Each source-specific parser should extend this class
 */
export abstract class BaseParser {
  protected readonly logger: Logger;
  protected readonly baseUrl: string;

  /**
   * Creates a new BaseParser instance
   * @param logger - Logger instance
   * @param baseUrl - Base URL of the website
   */
  constructor(logger: Logger, baseUrl: string) {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Parses job listings from HTML content
   * Must be implemented by source-specific parsers
   * @param html - HTML content to parse
   * @param pageUrl - URL of the page being parsed
   * @returns Array of parsed job listings
   */
  abstract parseJobListings(html: string, pageUrl: string): BaseJobListing[];

  /**
   * Parses a single job listing from HTML element
   * Must be implemented by source-specific parsers
   * @param html - HTML content containing the job listing
   * @param jobElement - Specific element containing job data (implementation-specific)
   * @param pageUrl - URL of the page being parsed
   * @returns Parsed job listing or null if parsing fails
   */
  protected abstract parseJobListing(
    html: string,
    jobElement: unknown,
    pageUrl: string
  ): BaseJobListing | null;
}

