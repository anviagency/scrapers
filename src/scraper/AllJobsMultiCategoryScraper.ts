import type { HttpClient } from '../http/HttpClient';
import type { JobListingParser } from './JobListingParser';
import type { Logger } from '../utils/logger';
import type { JobListing } from '../types/JobListing';
import type { AllJobsDatabaseManager } from '../database/alljobs/AllJobsDatabaseManager';
import * as cheerio from 'cheerio';

/**
 * Category definition with position ID and name
 */
interface CategoryDefinition {
  positionId: string;
  name: string;
}

/**
 * Scraping options for multi-category scraper
 */
export interface MultiCategoryScrapingOptions {
  maxPagesPerCategory?: number;
  sessionId?: number;
}

/**
 * AllJobs Multi-Category Scraper
 * Scrapes jobs by category to ensure category information is captured
 */
export class AllJobsMultiCategoryScraper {
  private readonly httpClient: HttpClient;
  private readonly parser: JobListingParser;
  private readonly logger: Logger;
  private readonly database: AllJobsDatabaseManager;
  private readonly baseUrl: string = 'https://www.alljobs.co.il';
  private readonly scrapedJobIds: Set<string> = new Set();

  /**
   * Comprehensive list of AllJobs categories with their position IDs
   */
  private readonly categories: CategoryDefinition[] = [
    // Main job categories
    { positionId: '235', name: 'תוכנה' },
    { positionId: '262', name: 'אדמיניסטרציה' },
    { positionId: '357', name: 'מחשבים ורשתות' },
    { positionId: '376', name: 'אבטחה שמירה ובטחון' },
    { positionId: '383', name: 'בניין, בינוי ותשתיות' },
    { positionId: '432', name: 'בדיקות תוכנה' },
    { positionId: '469', name: 'הוראה, חינוך והדרכה' },
    { positionId: '484', name: 'חשמל ואלקטרוניקה' },
    { positionId: '493', name: 'מכירות' },
    { positionId: '513', name: 'פרסום, שיווק ויחסי ציבור' },
    { positionId: '552', name: 'ייצור ותעשייה' },
    { positionId: '570', name: 'רכש ולוגיסטיקה' },
    { positionId: '576', name: 'כספים וכלכלה' },
    { positionId: '613', name: 'חקלאות' },
    { positionId: '640', name: 'עבודה סוציאלית' },
    { positionId: '660', name: 'משאבי אנוש' },
    { positionId: '669', name: 'עורכי דין' },
    { positionId: '692', name: 'שירות לקוחות' },
    { positionId: '722', name: 'בכירים' },
    { positionId: '854', name: 'חשב שכר' },
    { positionId: '937', name: 'מכירות הייטק' },
    { positionId: '969', name: 'מהנדסים' },
    { positionId: '1079', name: 'רפואה ובריאות' },
    { positionId: '1153', name: 'מזון ומשקאות' },
    { positionId: '1156', name: 'מנהל מוצר' },
    { positionId: '1179', name: 'הנדסאי בניין' },
    { positionId: '1187', name: 'PMO' },
    { positionId: '1203', name: 'עיצוב גרפי' },
    { positionId: '1310', name: 'BI' },
    { positionId: '1373', name: 'אופנה וטקסטיל' },
    { positionId: '1380', name: 'ביוטק' },
    { positionId: '1439', name: 'עבודה לסטודנטים' },
    { positionId: '1498', name: 'תחבורה' },
    { positionId: '1518', name: 'מלונאות ותיירות' },
    { positionId: '1553', name: 'ספורט וכושר' },
    { positionId: '1564', name: 'נהגים' },
    { positionId: '1580', name: 'עבודה מועדפת' },
    { positionId: '1603', name: 'מנהל חשבונות' },
    { positionId: '1637', name: 'מחסנאות' },
    { positionId: '1671', name: 'Big Data' },
    { positionId: '1694', name: 'DevOps' },
    { positionId: '1712', name: 'UX/UI' },
    { positionId: '1732', name: 'Data Analyst' },
    { positionId: '1733', name: 'Data Scientist' },
    { positionId: '1738', name: 'Customer Success' },
    { positionId: '1758', name: 'סייבר' },
    { positionId: '1778', name: 'SOC' },
    { positionId: '1795', name: 'מנהל דיגיטל' },
    { positionId: '1998', name: 'AI ולמידת מכונה' },
    { positionId: '644', name: 'בתי קפה, מסעדות ואירועים' },
    { positionId: '699', name: 'נציגי שירות ומכירה' },
    { positionId: '843', name: 'שפים' },
    { positionId: '320', name: 'ניקיון ותחזוקה' },
    { positionId: '661', name: 'HR' },
    { positionId: '672', name: 'יועץ משפטי' },
  ];

  constructor(
    httpClient: HttpClient,
    parser: JobListingParser,
    logger: Logger,
    database: AllJobsDatabaseManager
  ) {
    this.httpClient = httpClient;
    this.parser = parser;
    this.logger = logger;
    this.database = database;
  }

  /**
   * Scrapes all categories
   */
  async scrapeAllCategories(options: MultiCategoryScrapingOptions = {}): Promise<{
    totalJobs: number;
    totalPages: number;
    categoriesScraped: number;
  }> {
    const { maxPagesPerCategory = 10000, sessionId } = options; // NO LIMIT: Set to 10000 to ensure we get ALL jobs

    let totalJobs = 0;
    let totalPages = 0;
    let categoriesScraped = 0;

    // Don't load all job IDs - let database handle duplicates via upsert
    // This is MUCH faster for large databases
    this.logger.info('Starting multi-category scraping', {
      totalCategories: this.categories.length,
      maxPagesPerCategory,
    });

    for (const category of this.categories) {
      try {
        this.logger.info(`Scraping category: ${category.name}`, {
          positionId: category.positionId,
          categoryIndex: categoriesScraped + 1,
          totalCategories: this.categories.length,
        });

        const result = await this.scrapeCategory(category, maxPagesPerCategory, sessionId);
        
        totalJobs += result.jobsFound;
        totalPages += result.pagesScraped;
        categoriesScraped++;

        this.logger.info(`Completed category: ${category.name}`, {
          jobsFound: result.jobsFound,
          pagesScraped: result.pagesScraped,
          totalJobsSoFar: totalJobs,
        });

        // Update session if provided
        if (sessionId) {
          this.database.updateScrapingSession(sessionId, {
            pagesScraped: totalPages,
            jobsFound: totalJobs,
            status: 'running',
          });
        }

      } catch (error) {
        this.logger.error(`Error scraping category: ${category.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next category
      }
    }

    this.logger.info('Multi-category scraping completed', {
      totalJobs,
      totalPages,
      categoriesScraped,
      uniqueJobsCollected: this.scrapedJobIds.size,
    });

    return { totalJobs, totalPages, categoriesScraped };
  }

  /**
   * Scrapes a single category
   */
  private async scrapeCategory(
    category: CategoryDefinition,
    _maxPages: number, // Not used - no limit, but kept for API compatibility
    _sessionId?: number
  ): Promise<{ jobsFound: number; pagesScraped: number }> {
    let jobsFound = 0;
    let pagesScraped = 0;
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmptyPages = 100; // NO LIMIT: Increased to 100 - don't stop on gaps, only on truly empty pages
    const categoryScrapedIds = new Set<string>(); // Track duplicates only within this category

    // NO LIMIT: Continue indefinitely until we hit truly empty pages or errors
    while (true) {
      try {
        const pageUrl = this.getCategoryPageUrl(category.positionId, currentPage);
        
        this.logger.debug(`Fetching page ${currentPage} for category ${category.name}`, { pageUrl });
        
        const response = await this.httpClient.get(pageUrl);
        const html = response.data;

        // Parse jobs from page
        const jobs = this.parser.parseJobListings(html, pageUrl);
        
        // Add category to each job and filter duplicates within this category only
        // Database upsert will handle duplicates across categories
        const newJobs: JobListing[] = [];
        for (const job of jobs) {
          if (!categoryScrapedIds.has(job.jobId)) {
            categoryScrapedIds.add(job.jobId);
            this.scrapedJobIds.add(job.jobId); // Track globally for this session
            // Use category from scraping context - much faster than fetching each job page
            job.category = category.name;
            newJobs.push(job);
          }
        }

        // Only count as empty if NO jobs found at all (not just duplicates)
        // If jobs exist but are duplicates, continue - we might find new jobs on next pages
        if (jobs.length === 0) {
          consecutiveEmptyPages++;
          this.logger.debug(`Page ${currentPage}: Truly empty page (no jobs found)`, {
            category: category.name,
            consecutiveEmptyPages,
          });
        } else {
          // Page has jobs - reset empty counter even if they're duplicates
          consecutiveEmptyPages = 0;
          
          if (newJobs.length > 0) {
            // Save to database
            const saved = this.database.upsertJobs(newJobs);
            jobsFound += newJobs.length;
            
            this.logger.info(`Page ${currentPage}: Found ${jobs.length} jobs, ${newJobs.length} new, saved ${saved}`, {
              category: category.name,
              page: currentPage,
            });
          } else {
            this.logger.debug(`Page ${currentPage}: Found ${jobs.length} jobs but all duplicates`, {
              category: category.name,
            });
          }
        }

        pagesScraped++;

        // Update session after each page for real-time progress tracking
        if (_sessionId) {
          this.database.updateScrapingSession(_sessionId, {
            pagesScraped: pagesScraped,
            jobsFound: jobsFound,
            status: 'running',
          });
        }

        // Check if we should stop
        if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
          this.logger.info(`Stopping category ${category.name}: ${maxConsecutiveEmptyPages} consecutive empty pages`);
          break;
        }

        // NO LIMIT: Always try next page - don't stop based on maxPages or hasNextPage
        // Only stop on consecutive empty pages or errors
        const hasNextPage = this.hasNextPage(html, currentPage);
        if (!hasNextPage) {
          // Even if hasNextPage returns false, try next page manually (might be pagination issue)
          this.logger.debug(`hasNextPage returned false for page ${currentPage}, but continuing to page ${currentPage + 1} (no limit)`);
        }

        currentPage++;

      } catch (error) {
        this.logger.error(`Error on page ${currentPage} of category ${category.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        currentPage++;
        consecutiveEmptyPages++;
        
        if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
          break;
        }
      }
    }

    return { jobsFound, pagesScraped };
  }

  /**
   * Generates URL for a category page
   */
  private getCategoryPageUrl(positionId: string, page: number): string {
    return `${this.baseUrl}/SearchResultsGuest.aspx?page=${page}&position=${positionId}&type=&city=&region=`;
  }

  /**
   * Checks if there's a next page
   */
  private hasNextPage(html: string, currentPage: number): boolean {
    try {
      const $ = cheerio.load(html);
      
      // Look for "דף הבא" (next page) link
      const $nextLink = $('a:contains("דף הבא"), a:contains("הבא")').first();
      if ($nextLink.length > 0) {
        return true;
      }

      // Alternative: Look for page number greater than current
      const $pageLinks = $('a[href*="SearchResultsGuest.aspx"][href*="page="]');
      let hasHigherPage = false;
      $pageLinks.each((_, el) => {
        const href = $(el).attr('href') || '';
        const pageMatch = href.match(/page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          if (pageNum > currentPage) {
            hasHigherPage = true;
          }
        }
      });

      return hasHigherPage;
    } catch (error) {
      return false;
    }
  }
}

