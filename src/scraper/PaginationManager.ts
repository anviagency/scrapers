import * as cheerio from 'cheerio';
import type { Logger } from '../utils/logger';
import type { Element } from 'domhandler';

/**
 * Manages pagination for scraping multiple pages
 */
export class PaginationManager {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private maxPages?: number;

  /**
   * Creates a new PaginationManager instance
   * @param baseUrl - Base URL of the website
   * @param logger - Logger instance
   */
  constructor(baseUrl: string, logger: Logger) {
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  /**
   * Sets maximum number of pages to scrape
   * @param maxPages - Maximum pages to scrape
   */
  setMaxPages(maxPages: number): void {
    this.maxPages = maxPages;
    this.logger.info('Set max pages limit', { maxPages });
  }

  /**
   * Generates URL for a specific page number
   * @param pageNumber - Page number (1-indexed)
   * @param filters - Optional search filters
   * @returns URL string for the page
   */
  getPageUrl(
    pageNumber: number,
    filters?: {
      position?: string;
      type?: string;
      city?: string;
      region?: string;
    }
  ): string {
    const params = new URLSearchParams({
      page: pageNumber.toString(),
      position: filters?.position || '',
      type: filters?.type || '',
      city: filters?.city || '',
      region: filters?.region || '',
    });

    return `${this.baseUrl}/SearchResultsGuest.aspx?${params.toString()}`;
  }

  /**
   * Extracts next page number from HTML
   * @param html - HTML content of current page
   * @param currentPage - Current page number
   * @returns Next page number or null if no next page
   */
  getNextPageNumber(html: string, currentPage: number): number | null {
    try {
      const $ = cheerio.load(html);

      // Look for "דף הבא" (next page) link
      const $nextLink = $('a:contains("דף הבא"), a:contains("הבא")').first();
      if ($nextLink.length > 0) {
        const href = $nextLink.attr('href') || '';
        const pageMatch = href.match(/page=(\d+)/);
        if (pageMatch) {
          const nextPage = parseInt(pageMatch[1], 10);
          if (nextPage > currentPage) {
            this.logger.debug('Found next page', { currentPage, nextPage });
            return nextPage;
          }
        }
      }

      // Alternative: Look for numbered pagination links
      const $pageLinks = $('a[href*="SearchResultsGuest.aspx"]');
      let maxPageFound = currentPage;
      $pageLinks.each((_: number, element: Element) => {
        const href = $(element).attr('href') || '';
        const pageMatch = href.match(/page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          if (pageNum > maxPageFound) {
            maxPageFound = pageNum;
          }
        }
      });

      if (maxPageFound > currentPage) {
        return currentPage + 1;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to extract next page number', {
        error: error instanceof Error ? error.message : String(error),
        currentPage,
      });
      return null;
    }
  }

  /**
   * Checks if current page is the last page
   * @param html - HTML content of current page
   * @param currentPage - Current page number
   * @returns True if this is the last page
   */
  isLastPage(html: string, currentPage: number): boolean {
    const nextPage = this.getNextPageNumber(html, currentPage);
    return nextPage === null;
  }

  /**
   * Extracts maximum page number from pagination links
   * @param html - HTML content
   * @returns Maximum page number found, or null if not found
   */
  getMaxPageNumber(html: string): number | null {
    try {
      const $ = cheerio.load(html);
      const $pageLinks = $('a[href*="SearchResultsGuest.aspx"][href*="page="]');
      let maxPage = 0;

      $pageLinks.each((_: number, element: Element) => {
        const href = $(element).attr('href') || '';
        const pageMatch = href.match(/page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          if (pageNum > maxPage) {
            maxPage = pageNum;
          }
        }
      });

      return maxPage > 0 ? maxPage : null;
    } catch (error) {
      this.logger.error('Failed to extract max page number', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Estimates maximum pages from total jobs count mentioned in HTML
   * @param html - HTML content
   * @param jobsPerPage - Average number of jobs per page
   * @returns Estimated maximum page number
   */
  estimateMaxPages(html: string, jobsPerPage: number = 20): number {
    try {
      // Look for patterns like "נמצאו 31,794 משרות" or "31,794 jobs"
      const countMatch = html.match(/(\d{1,3}(?:[,\s]\d{3})*)\s*משרות?/);
      if (countMatch) {
        const totalJobsStr = countMatch[1].replace(/[,\s]/g, '');
        const totalJobs = parseInt(totalJobsStr, 10);
        if (!isNaN(totalJobs) && totalJobs > 0) {
          const estimatedPages = Math.ceil(totalJobs / jobsPerPage);
          this.logger.debug('Estimated max pages from job count', {
            totalJobs,
            jobsPerPage,
            estimatedPages,
          });
          return estimatedPages;
        }
      }
    } catch (error) {
      this.logger.warn('Failed to estimate max pages', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return 0;
  }

  /**
   * Checks if page number exceeds maximum allowed
   * @param pageNumber - Page number to check
   * @returns True if page exceeds maximum
   */
  exceedsMaxPages(pageNumber: number): boolean {
    if (this.maxPages === undefined) {
      return false;
    }
    return pageNumber > this.maxPages;
  }
}

