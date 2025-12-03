import * as cheerio from 'cheerio';
import type { Logger } from '../../utils/logger';
import type { IPaginationManager } from '../base/BaseScraper';

/**
 * Manages pagination for JobMaster scraping
 * Implements IPaginationManager interface
 */
export class JobMasterPaginationManager implements IPaginationManager {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private maxPages?: number;

  /**
   * Creates a new JobMasterPaginationManager instance
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
   * Gets the next page URL from HTML content
   * @param html - HTML content of current page
   * @param currentUrl - Current page URL
   * @param currentPage - Current page number
   * @returns Next page URL or null if no next page
   */
  getNextPageUrl(html: string, currentUrl: string, currentPage: number): string | null {
    try {
      const $ = cheerio.load(html);

      // First, check if there are any job listings on the page
      // But don't stop immediately - parser might find jobs even if selectors don't match
      // Only stop if we're sure there are no job-related elements at all
      const hasJobElements = $('article.JobItem, article.CardStyle, .ul_results_list article, article[class*="Job"], div[class*="Job"], a[href*="checknum"], a[href*="/jobs/"]').length > 0;
      if (!hasJobElements) {
        this.logger.warn('No job-related elements found on page, might be at end', { currentPage });
        // Don't return null immediately - let the parser try first
        // The parser will return empty array if no jobs found, and BaseScraper will handle it
      }

      // JobMaster uses currPage parameter in URL: /jobs/?currPage=2&q=...
      // IMPORTANT: paginationNext goes BACKWARDS (to previous page), not forwards!
      // We should NOT use paginationNext for next page - it's confusing naming
      // Instead, we'll use numbered pagination links or construct URL ourselves
      
      // Skip paginationNext - it goes backwards, not forwards
      // const $nextLink = $('a.paginationNext').not('.paginationPointerEventNone').not('.disabled').first();
      
      // Note: paginationPrev goes backwards, so we don't use it for next page
      // We rely on numbered pagination links or URL construction instead

      // Alternative: Look for numbered pagination links with class "paging"
      // JobMaster shows numbered pages: 1, 2, 3, ... 10
      // Find the link that corresponds to currentPage + 1
      const $pageLinks = $('a.paging').not('.disabled').not('.selected');
      let nextPageUrl: string | null = null;
      let foundNextPage = false;
      let maxPageFound = 0;

      $pageLinks.each((_, element) => {
        if (foundNextPage) return false; // Already found, break
        
        const $link = $(element);
        const href = $link.attr('href') || '';
        const pageMatch = href.match(/currPage[=:](\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          maxPageFound = Math.max(maxPageFound, pageNum);
          
          if (pageNum === currentPage + 1) {
            const isDisabled = $link.hasClass('disabled') || $link.hasClass('selected');
            if (!isDisabled && href !== currentUrl && href !== 'javascript:void(0)') {
              nextPageUrl = href.startsWith('http') ? href : `${this.baseUrl}${href.startsWith('/') ? href : `/${href}`}`;
              foundNextPage = true;
              return false; // Break the loop
            }
          }
        }
        return true; // Continue iteration
      });

      if (nextPageUrl) {
        this.logger.info('Found next page from pagination links', { currentPage, nextPage: currentPage + 1, nextPageUrl });
        return nextPageUrl;
      }
      
      // If we found pages but not the exact next one, and currentPage + 1 <= maxPageFound, construct URL
      if (maxPageFound > 0 && currentPage + 1 <= maxPageFound) {
        // We know there are more pages, construct the URL
        try {
          const url = new URL(currentUrl);
          url.searchParams.set('currPage', (currentPage + 1).toString());
          const constructedUrl = url.toString();
          this.logger.info('Constructing next page URL based on pagination', { 
            currentPage, 
            nextPage: currentPage + 1,
            maxPageFound,
            constructedUrl
          });
          return constructedUrl;
        } catch (urlError) {
          // Fall through to URL construction below
        }
      }

      // Fallback: Construct URL based on current URL pattern
      // This is important because JobMaster might not always show pagination links
      try {
        const url = new URL(currentUrl);
        const currentPageParam = url.searchParams.get('currPage');
        
        if (currentPageParam) {
          const currentPageNum = parseInt(currentPageParam, 10);
          const nextPage = currentPageNum + 1;
          
          // Always try to construct next page URL - don't limit artificially
          // The scraper will stop naturally if there are no more jobs
          url.searchParams.set('currPage', nextPage.toString());
          const constructedUrl = url.toString();
          
          // Make sure constructed URL is different from current
          if (constructedUrl !== currentUrl) {
            this.logger.info('Constructed next page URL (fallback)', { 
              currentPage, 
              currentPageNum,
              nextPage,
              constructedUrl 
            });
            return constructedUrl;
          }
        } else {
          // If no currPage param exists, add it (starting from page 2)
          // But preserve the q parameter (important for q=* queries)
          url.searchParams.set('currPage', '2');
          const constructedUrl = url.toString();
          this.logger.info('Added currPage parameter to URL', { 
            currentPage, 
            constructedUrl 
          });
          return constructedUrl;
        }
      } catch (urlError) {
        // URL parsing failed, try string manipulation
        if (currentUrl.includes('currPage=')) {
          const nextPage = currentPage + 1;
          const nextUrl = currentUrl.replace(/currPage=\d+/, `currPage=${nextPage}`);
          
          // Make sure constructed URL is different from current
          if (nextUrl !== currentUrl) {
            this.logger.info('Constructed next page URL (string replace)', { 
              currentPage, 
              nextPage,
              nextUrl 
            });
            return nextUrl;
          }
        } else {
          // Add currPage parameter if it doesn't exist
          // Preserve existing query parameters (especially q=*)
          const separator = currentUrl.includes('?') ? '&' : '?';
          const nextUrl = `${currentUrl}${separator}currPage=2`;
          this.logger.info('Added currPage parameter (string manipulation)', { 
            currentPage, 
            nextUrl 
          });
          return nextUrl;
        }
      }

      // Last resort: ALWAYS try to construct next page URL
      // Never return null - let the scraper continue until it hits empty pages naturally
      // This is critical because JobMaster might have gaps or not show all pagination links
      try {
        const url = new URL(currentUrl);
        const currentPageParam = url.searchParams.get('currPage');
        const nextPage = currentPageParam ? parseInt(currentPageParam, 10) + 1 : 2;
        
        // Don't limit page numbers - let it go as high as needed
        // The scraper will stop naturally when it hits consecutive empty pages
        url.searchParams.set('currPage', nextPage.toString());
        const constructedUrl = url.toString();
        
        if (constructedUrl !== currentUrl) {
          this.logger.info('Constructed next page URL (last resort - always continue)', { 
            currentPage, 
            nextPage,
            constructedUrl 
          });
          return constructedUrl;
        }
      } catch (urlError) {
        // If URL construction fails, try string manipulation
        if (currentUrl.includes('currPage=')) {
          const nextPage = currentPage + 1;
          const nextUrl = currentUrl.replace(/currPage=\d+/, `currPage=${nextPage}`);
          if (nextUrl !== currentUrl) {
            this.logger.info('Constructed next page URL (string replace last resort)', { 
              currentPage, 
              nextPage,
              nextUrl 
            });
            return nextUrl;
          }
        } else {
          const separator = currentUrl.includes('?') ? '&' : '?';
          const nextUrl = `${currentUrl}${separator}currPage=2`;
          this.logger.info('Added currPage parameter (string manipulation last resort)', { 
            currentPage, 
            nextUrl 
          });
          return nextUrl;
        }
      }
      
      // This should never happen, but if it does, try one more time with basic increment
      // NEVER return null - always try to construct next page URL
      this.logger.warn('Could not determine next page URL, trying basic increment', { currentPage, currentUrl });
      try {
        const url = new URL(currentUrl);
        const nextPage = currentPage + 1;
        url.searchParams.set('currPage', nextPage.toString());
        const constructedUrl = url.toString();
        this.logger.info('Constructed next page URL (final fallback)', { 
          currentPage, 
          nextPage,
          constructedUrl 
        });
        return constructedUrl;
      } catch (urlError) {
        // Even if URL parsing fails, try string manipulation
        if (currentUrl.includes('currPage=')) {
          const nextPage = currentPage + 1;
          const nextUrl = currentUrl.replace(/currPage=\d+/, `currPage=${nextPage}`);
          this.logger.info('Constructed next page URL (final string fallback)', { 
            currentPage, 
            nextPage,
            nextUrl 
          });
          return nextUrl;
        } else {
          const separator = currentUrl.includes('?') ? '&' : '?';
          const nextUrl = `${currentUrl}${separator}currPage=2`;
          this.logger.info('Added currPage parameter (final fallback)', { 
            currentPage, 
            nextUrl 
          });
          return nextUrl;
        }
      }
    } catch (error) {
      this.logger.error('Failed to extract next page URL', {
        error: error instanceof Error ? error.message : String(error),
        currentPage,
      });
      return null;
    }
  }

  /**
   * Checks if there is a next page
   * @param html - HTML content of current page
   * @param currentPage - Current page number
   * @returns True if there is a next page
   */
  hasNextPage(html: string, currentPage: number): boolean {
    const nextUrl = this.getNextPageUrl(html, '', currentPage);
    return nextUrl !== null;
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

