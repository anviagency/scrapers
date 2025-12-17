import type { HttpClient } from '../http/HttpClient';
import type { JobListingParser } from './JobListingParser';
import type { Logger } from '../utils/logger';
import type { JobListing } from '../types/JobListing';
import type { AllJobsDatabaseManager } from '../database/alljobs/AllJobsDatabaseManager';
import type { ActivityLogger } from '../monitoring/ActivityLogger';
import { AllJobsJobDetailFetcher } from './AllJobsJobDetailFetcher';
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
  fetchJobDetails?: boolean; // Whether to fetch individual job detail pages for full category extraction (default: true)
  detailFetchConcurrency?: number; // Max concurrent detail page fetches (default: 10)
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
  private readonly activityLogger?: ActivityLogger;
  private readonly baseUrl: string = 'https://www.alljobs.co.il';
  // MEMORY FIX: scrapedJobIds is now cleared after each category to prevent memory growth
  private scrapedJobIds: Set<string> = new Set();
  private detailFetcher: AllJobsJobDetailFetcher | null = null;

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
    database: AllJobsDatabaseManager,
    activityLogger?: ActivityLogger
  ) {
    this.httpClient = httpClient;
    this.parser = parser;
    this.logger = logger;
    this.database = database;
    this.activityLogger = activityLogger;
  }

  /**
   * Scrapes all categories
   */
  async scrapeAllCategories(options: MultiCategoryScrapingOptions = {}): Promise<{
    totalJobs: number;
    totalPages: number;
    categoriesScraped: number;
  }> {
    // OPTIMIZATION: Disable detail fetching by default for speed
    // Can be enabled if full category extraction is needed
    const fetchJobDetails = options.fetchJobDetails === true; // Default: false for speed
    const detailFetchConcurrency = options.detailFetchConcurrency || 25; // Increased from 10 to 20

    // Initialize detail fetcher if needed
    if (fetchJobDetails) {
      this.detailFetcher = new AllJobsJobDetailFetcher(
        this.httpClient,
        this.logger,
        this.baseUrl,
        {
          maxConcurrency: detailFetchConcurrency,
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
        }
      );
      this.logger.info('Job detail fetching enabled', {
        maxConcurrency: detailFetchConcurrency,
      });
    }
    const { maxPagesPerCategory = 10000, sessionId } = options;

    let totalPages = 0;
    let categoriesScraped = 0;

    // Track initial database count for accurate progress
    const initialDbCount = this.database.getJobsCount();
    this.logger.info('Starting multi-category scraping', {
      totalCategories: this.categories.length,
      maxPagesPerCategory,
      initialDatabaseCount: initialDbCount,
    });

    for (const category of this.categories) {
      try {
        this.logger.info(`>>> Starting category ${categoriesScraped + 1}/${this.categories.length}: ${category.name}`, {
          positionId: category.positionId,
        });

        const result = await this.scrapeCategory(category, maxPagesPerCategory, sessionId, fetchJobDetails);
        
        totalPages += result.pagesScraped;
        categoriesScraped++;

        // Get REAL database count for accurate session tracking
        const currentDbCount = this.database.getJobsCount();
        const jobsFoundInSession = currentDbCount - initialDbCount;

        this.logger.info(`<<< Completed category: ${category.name}`, {
          jobsSavedFromCategory: result.jobsFound,
          pagesScraped: result.pagesScraped,
          totalJobsInDatabase: currentDbCount,
          jobsAddedThisSession: jobsFoundInSession,
        });

        // Update session with REAL database count
        if (sessionId) {
          this.database.updateScrapingSession(sessionId, {
            pagesScraped: totalPages,
            jobsFound: jobsFoundInSession, // Use real count, not accumulated
            status: 'running',
          });
        }

        // MEMORY FIX: Clear scrapedJobIds after each category to prevent memory growth
        // The database upsert handles deduplication, so we don't need to track globally
        this.scrapedJobIds.clear();
        
        // Force garbage collection hint (Node.js will GC when needed)
        if (global.gc) {
          global.gc();
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error scraping category: ${category.name}`, {
          error: errorMessage,
        });
        
        // Log error activity
        if (this.activityLogger) {
          this.activityLogger.logError('alljobs', errorMessage, {
            category: category.name,
          });
        }
        
        // Continue with next category
      }
    }

    // Get final REAL count from database
    const finalDbCount = this.database.getJobsCount();
    const totalNewJobs = finalDbCount - initialDbCount;

    this.logger.info('Multi-category scraping completed', {
      totalJobsInDatabase: finalDbCount,
      newJobsAddedThisSession: totalNewJobs,
      totalPages,
      categoriesScraped,
    });

    // MEMORY FIX: Final cleanup
    this.scrapedJobIds.clear();
    this.detailFetcher = null;

    return { totalJobs: totalNewJobs, totalPages, categoriesScraped };
  }

  /**
   * Scrapes a single category
   */
  private async scrapeCategory(
    category: CategoryDefinition,
    maxPages: number,
    sessionId?: number,
    fetchJobDetails: boolean = false
  ): Promise<{ jobsFound: number; pagesScraped: number }> {
    let jobsFound = 0;
    let pagesScraped = 0;
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmptyPages = 200; // Increased to 200 - don't stop on gaps, continue scraping even with duplicates
    const categoryScrapedIds = new Set<string>(); // Track duplicates only within this category

    // Continue until we hit max pages, empty pages, or errors
    while (currentPage <= maxPages) {
      try {
        const pageUrl = this.getCategoryPageUrl(category.positionId, currentPage);
        
        this.logger.debug(`Fetching page ${currentPage} for category ${category.name}`, { pageUrl });
        
        const response = await this.httpClient.get(pageUrl);
        const html = response.data;

        // Parse jobs from page
        const jobs = this.parser.parseJobListings(html, pageUrl);
        
        // Log parsing activity
        if (this.activityLogger) {
          this.activityLogger.logParsing('alljobs', category.name, currentPage, jobs.length);
        }
        
        // Add category to each job and filter duplicates within this category only
        // Database upsert will handle duplicates across categories
        const newJobs: JobListing[] = [];
        for (const job of jobs) {
          if (!categoryScrapedIds.has(job.jobId)) {
            categoryScrapedIds.add(job.jobId);
            this.scrapedJobIds.add(job.jobId); // Track globally for this session
            // Use category from scraping context as initial value
            // Will be enhanced with full categories from detail page if fetchJobDetails is enabled
            job.category = category.name;
            newJobs.push(job);
          }
        }

        // Check which jobs already exist in the database
        // We skip existing jobs entirely to preserve their existing category data
        const allJobIds = newJobs.map(job => job.jobId);
        const existingJobIds = this.database.getExistingJobIdsFromList(allJobIds);
        
        // Filter to only truly new jobs (not in database)
        const jobsToSave = newJobs.filter(job => !existingJobIds.has(job.jobId));

        this.logger.debug(`Filtered jobs for saving: ${jobsToSave.length} new, ${existingJobIds.size} already in DB`, {
          category: category.name,
          page: currentPage,
          totalScraped: newJobs.length,
          existingInDb: existingJobIds.size,
          newToSave: jobsToSave.length,
        });

        // Fetch job detail pages to extract ALL categories (if enabled)
        // Only for new jobs that will be saved
        if (fetchJobDetails && jobsToSave.length > 0 && this.detailFetcher) {
          try {
            this.logger.info('Fetching job details for new jobs', {
              category: category.name,
              page: currentPage,
              jobsToFetch: jobsToSave.length,
            });

            const jobIds = jobsToSave.map(job => job.jobId);
            const jobUrls = jobsToSave.map(job => job.applicationUrl.startsWith('http')
              ? job.applicationUrl
              : `${this.baseUrl}${job.applicationUrl.startsWith('/') ? job.applicationUrl : `/${job.applicationUrl}`}`
            );

            const detailResults = await this.detailFetcher.fetchJobDetails(jobIds, jobUrls);

            // Update jobs with full category information from detail pages
            for (let i = 0; i < jobsToSave.length; i++) {
              const detailResult = detailResults[i];
              const job = jobsToSave[i];
              if (detailResult.success && detailResult.html) {
                const detailData = this.parser.parseJobDetailPage(detailResult.html, job.jobId);

                // If we found categories from detail page, use them (join with comma)
                // Otherwise, keep the category from scraping context
                if (detailData.categories.length > 0) {
                  job.category = detailData.categories.join(', ');
                  this.logger.debug('Updated job with categories from detail page', {
                    jobId: job.jobId,
                    categories: detailData.categories,
                  });
                }

                // Optionally update description and requirements if available
                if (detailData.fullDescription && !job.description) {
                  job.description = detailData.fullDescription;
                }
                if (detailData.fullRequirements && !job.requirements) {
                  job.requirements = detailData.fullRequirements;
                }
              } else {
                // If detail fetch failed, keep the category from scraping context
                this.logger.debug('Detail fetch failed, using category from context', {
                  jobId: job.jobId,
                  error: detailResult.error,
                });
              }
            }
          } catch (error) {
            // If detail fetching fails, continue with category from context
            this.logger.warn('Failed to fetch job details, using category from context', {
              category: category.name,
              page: currentPage,
              error: error instanceof Error ? error.message : String(error),
            });
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
          // Page has jobs - check if we have NEW jobs to save
          if (jobsToSave.length > 0) {
            // Reset empty counter only if we found NEW jobs
            consecutiveEmptyPages = 0;
            
            // Save only new jobs to database - existing jobs are skipped to preserve their category
            const savedCount = this.database.upsertJobs(jobsToSave);
            jobsFound += savedCount; // Use actual saved count
            
            // Log database activity
            if (this.activityLogger) {
              this.activityLogger.logDatabase('alljobs', 'upsertJobs', savedCount);
            }
            
            this.logger.info(`[${category.name}] Page ${currentPage}: Found ${jobs.length} jobs, ${jobsToSave.length} new, ${savedCount} saved to DB`, {
              page: currentPage,
              totalSavedThisCategory: jobsFound,
            });
          } else {
            // All jobs are duplicates or already in database - count towards empty pages
            consecutiveEmptyPages++;
            this.logger.debug(`[${category.name}] Page ${currentPage}: Found ${jobs.length} jobs but all already in DB (consecutiveEmptyPages: ${consecutiveEmptyPages})`);
            
            // Don't stop on duplicates - continue scraping as they might be temporary blocking
            // Only log warning if we hit the threshold
            if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
              this.logger.warn(`[${category.name}] ${maxConsecutiveEmptyPages} consecutive pages with only existing jobs - continuing anyway (might be temporary blocking)`, {
                category: category.name,
                consecutiveEmptyPages,
                currentPage,
              });
            }
          }
        }

        pagesScraped++;

        // Update session after each page with REAL database count for live dashboard
        // Only every 5 pages to reduce database writes
        if (sessionId && (pagesScraped % 5 === 0 || jobsToSave.length > 0)) {
          const currentTotalJobs = this.database.getJobsCount();
          this.database.updateScrapingSession(sessionId, {
            pagesScraped: pagesScraped,
            jobsFound: currentTotalJobs, // Use REAL database count
            status: 'running',
          });
        }

        // Only stop on TRULY empty pages (no jobs at all), not on duplicates
        // This ensures we scrape everything even if there are temporary blocks
        if (jobs.length === 0 && consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
          this.logger.info(`Stopping category ${category.name}: ${maxConsecutiveEmptyPages} consecutive TRULY empty pages (no jobs found)`);
          break;
        }

        // Check if there are more pages
        const hasNextPage = this.hasNextPage(html, currentPage);
        if (!hasNextPage) {
          this.logger.debug(`hasNextPage returned false for page ${currentPage}, stopping category`, {
            category: category.name,
          });
          break;
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
   * Gets the actual active page number from the HTML
   * Uses div.jobs-paging-active selector to find the current page shown by the server
   */
  private getActualPageNumber(html: string): number | null {
    try {
      const $ = cheerio.load(html);
      const $activePage = $('div.jobs-paging-active').first();

      if ($activePage.length > 0) {
        const pageText = $activePage.text().trim();
        const pageNum = parseInt(pageText, 10);
        if (!isNaN(pageNum) && pageNum > 0) {
          return pageNum;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Checks if there's a next page
   */
  private hasNextPage(html: string, currentPage: number): boolean {
    try {
      const $ = cheerio.load(html);

      // First, verify the server actually returned the page we requested
      // If the actual page doesn't match, we've hit the end of pagination
      const actualPage = this.getActualPageNumber(html);
      this.logger.debug(`hasNextPage check`, {
        currentPage,
        actualPage,
        hasActivePage: actualPage !== null,
      });

      // Only apply page mismatch check for pages > 1 to avoid false positives on page 1
      // where pagination UI might not show an active page indicator
      if (actualPage !== null && currentPage > 1 && actualPage !== currentPage) {
        this.logger.debug(`Page mismatch detected: requested page ${currentPage}, server returned page ${actualPage}`, {
          requestedPage: currentPage,
          actualPage,
        });
        return false;
      }

      // Look for "דף הבא" (next page) link
      const $nextLink = $('a:contains("דף הבא"), a:contains("הבא")').first();
      if ($nextLink.length > 0) {
        this.logger.debug('Found next page link via Hebrew text');
        return true;
      }

      const $nextPageArrow = $('div.jobs-paging-next');
      if ($nextPageArrow.length > 0) {
        this.logger.debug('Found next page via jobs-paging-next div');
        return true;
      }

      // Alternative: Look for page number greater than current
      const $pageLinks = $('a[href*="SearchResultsGuest.aspx"][href*="page="]');
      let hasHigherPage = false;
      const foundPages: number[] = [];
      $pageLinks.each((_index: number, el: any) => {
        const href = $(el).attr('href') || '';
        const pageMatch = href.match(/page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          foundPages.push(pageNum);
          if (pageNum > currentPage) {
            hasHigherPage = true;
          }
        }
      });

      this.logger.debug('Page link analysis', {
        currentPage,
        foundPages,
        hasHigherPage,
        totalPageLinks: $pageLinks.length,
      });

      return hasHigherPage;
    } catch (error) {
      return false;
    }
  }
}

