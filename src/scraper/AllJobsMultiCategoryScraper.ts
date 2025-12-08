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
  private readonly scrapedJobIds: Set<string> = new Set();
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
    const detailFetchConcurrency = options.detailFetchConcurrency || 20; // Increased from 10 to 20

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
    const { maxPagesPerCategory = 10000, sessionId } = options; // NO LIMIT: Set to 10000 to ensure we get ALL jobs

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
      uniqueJobsCollected: this.scrapedJobIds.size,
    });

    return { totalJobs: totalNewJobs, totalPages, categoriesScraped };
  }

  /**
   * Scrapes a single category
   */
  private async scrapeCategory(
    category: CategoryDefinition,
    _maxPages: number, // Not used - no limit, but kept for API compatibility
    _sessionId?: number,
    fetchJobDetails: boolean = false
  ): Promise<{ jobsFound: number; pagesScraped: number }> {
    let jobsFound = 0;
    let pagesScraped = 0;
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmptyPages = 200; // Increased to 200 - don't stop on gaps, continue scraping even with duplicates
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

        // Fetch job detail pages to extract ALL categories (if enabled)
        if (fetchJobDetails && newJobs.length > 0 && this.detailFetcher) {
          try {
            this.logger.debug(`Fetching details for ${newJobs.length} jobs to extract full categories`, {
              category: category.name,
              page: currentPage,
            });

            const jobIds = newJobs.map(job => job.jobId);
            const jobUrls = newJobs.map(job => job.applicationUrl.startsWith('http') 
              ? job.applicationUrl 
              : `${this.baseUrl}${job.applicationUrl.startsWith('/') ? job.applicationUrl : `/${job.applicationUrl}`}`
            );

            const detailResults = await this.detailFetcher.fetchJobDetails(jobIds, jobUrls);

            // Update jobs with full category information from detail pages
            for (let i = 0; i < newJobs.length; i++) {
              const detailResult = detailResults[i];
              if (detailResult.success && detailResult.html) {
                const detailData = this.parser.parseJobDetailPage(detailResult.html, newJobs[i].jobId);
                
                // If we found categories from detail page, use them (join with comma)
                // Otherwise, keep the category from scraping context
                if (detailData.categories.length > 0) {
                  newJobs[i].category = detailData.categories.join(', ');
                  this.logger.debug('Updated job with categories from detail page', {
                    jobId: newJobs[i].jobId,
                    categories: detailData.categories,
                  });
                }

                // Optionally update description and requirements if available
                if (detailData.fullDescription && !newJobs[i].description) {
                  newJobs[i].description = detailData.fullDescription;
                }
                if (detailData.fullRequirements && !newJobs[i].requirements) {
                  newJobs[i].requirements = detailData.fullRequirements;
                }
              } else {
                // If detail fetch failed, keep the category from scraping context
                this.logger.debug('Detail fetch failed, using category from context', {
                  jobId: newJobs[i].jobId,
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
          // Page has jobs - check if we saved any NEW jobs
          if (newJobs.length > 0) {
            // Reset empty counter only if we found NEW jobs
            consecutiveEmptyPages = 0;
            
            // Save to database - track ACTUAL saved count
            const savedCount = this.database.upsertJobs(newJobs);
            jobsFound += savedCount; // Use actual saved count, not newJobs.length
            
            // Log database activity
            if (this.activityLogger) {
              this.activityLogger.logDatabase('alljobs', 'upsertJobs', savedCount);
            }
            
            this.logger.info(`[${category.name}] Page ${currentPage}: Found ${jobs.length} jobs, ${newJobs.length} new, ${savedCount} saved to DB`, {
              page: currentPage,
              totalSavedThisCategory: jobsFound,
            });
          } else {
            // All jobs are duplicates - count towards empty pages
            consecutiveEmptyPages++;
            this.logger.debug(`[${category.name}] Page ${currentPage}: Found ${jobs.length} jobs but all duplicates (consecutiveEmptyPages: ${consecutiveEmptyPages})`);
            
            // Don't stop on duplicates - continue scraping as they might be temporary blocking
            // Only log warning if we hit the threshold
            if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
              this.logger.warn(`[${category.name}] ${maxConsecutiveEmptyPages} consecutive pages with only duplicates - continuing anyway (might be temporary blocking)`, {
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
        if (_sessionId && (pagesScraped % 5 === 0 || newJobs.length > 0)) {
          const currentTotalJobs = this.database.getJobsCount();
          this.database.updateScrapingSession(_sessionId, {
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
      $pageLinks.each((_index: number, el: any) => {
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

