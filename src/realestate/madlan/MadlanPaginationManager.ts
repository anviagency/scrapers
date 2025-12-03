import * as cheerio from 'cheerio';
import type { Logger } from '../../utils/logger';
import { ListingType } from '../../types/MadlanListing';

/**
 * Manages pagination for Madlan listings and projects
 */
export class MadlanPaginationManager {
  private readonly logger: Logger;
  private readonly baseUrl: string;

  constructor(logger: Logger, baseUrl: string = 'https://www.madlan.co.il') {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Gets the URL for a specific page of listings
   * @param listingType - Type of listing
   * @param page - Page number (1-indexed)
   * @param region - Region filter (optional)
   * @returns URL for the page
   */
  getListingsPageUrl(listingType: ListingType, page: number, region?: string): string {
    const regionPath = region ? `/${region}` : '/ישראל';
    
    switch (listingType) {
      case ListingType.SALE:
        return `${this.baseUrl}/for-sale${regionPath}?page=${page}`;
      case ListingType.RENT:
        return `${this.baseUrl}/for-rent${regionPath}?page=${page}`;
      case ListingType.COMMERCIAL:
        return `${this.baseUrl}/commercial-market?page=${page}`;
      default:
        return `${this.baseUrl}/for-sale${regionPath}?page=${page}`;
    }
  }

  /**
   * Gets the URL for a specific page of projects
   * @param page - Page number (1-indexed)
   * @param region - Region filter (optional)
   * @returns URL for the page
   */
  getProjectsPageUrl(page: number, region?: string): string {
    const regionPath = region ? `/${region}` : '/ישראל';
    return `${this.baseUrl}/projects-for-sale${regionPath}?page=${page}`;
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
      const $nextLink = $('a:contains("דף הבא"), a:contains("הבא"), a:contains("Next")').first();
      if ($nextLink.length > 0) {
        const href = $nextLink.attr('href') || '';
        const pageMatch = href.match(/page=(\d+)/);
        if (pageMatch) {
          const nextPage = parseInt(pageMatch[1], 10);
          if (nextPage > currentPage) {
            return nextPage;
          }
        }
      }

      // Alternative: Look for numbered pagination links
      const $pageLinks = $('a[href*="page="]');
      let maxPageFound = currentPage;
      $pageLinks.each((_, element) => {
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
   * Checks if there's a next page
   * @param html - HTML content of current page
   * @param currentPage - Current page number
   * @returns True if there's a next page
   */
  hasNextPage(html: string, currentPage: number): boolean {
    return this.getNextPageNumber(html, currentPage) !== null;
  }
}

