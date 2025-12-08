import { HttpClient } from '../../http/HttpClient';
import { JobMasterParser } from './JobMasterParser';
import { JobMasterPaginationManager } from './JobMasterPaginationManager';
import { DataExporter } from '../../export/DataExporter';
import { createLogger } from '../../utils/logger';
import { ActivityLogger } from '../../monitoring/ActivityLogger';
import { JobMasterDatabaseManager } from '../../database/jobmaster/JobMasterDatabaseManager';

/**
 * Multi-category scraper for JobMaster
 * Scrapes multiple categories/searches to get all available jobs
 */
export class MultiCategoryScraper {
  private readonly httpClient: HttpClient;
  private readonly parser: JobMasterParser;
  private readonly paginationManager: JobMasterPaginationManager;
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly database: JobMasterDatabaseManager;
  private readonly baseUrl: string;
  private readonly scrapedJobIds: Set<string> = new Set();
  private sessionId: number | null = null;

  /**
   * Comprehensive list of categories/filters to scrape
   * Based on JobMaster website structure with filters by:
   * - Field (תחום)
   * - Region (אזור)
   * - Job characteristics (מאפייני משרה)
   * - Suitability (מתאים ל)
   * - Job scope (היקף משרה)
   */
  
  // Categories by field (תחום) - from the website
  private readonly fieldCategories: string[] = [
    'מכונות ותעשיה',
    'מכירות',
    'מנהלה ומזכירות',
    'שירות לקוחות',
    'לוגיסטיקה ומחסנים',
    'חשבונאות וכספים',
    'מחשבים ותוכנה',
    'כללי',
    'נהגים, רכב ותחבורה',
    'רפואה ופארמה',
    'חשמל',
    'בנייה/נדל"ן',
    'אלקטרוניקה וחומרה',
    'קמעונאות',
    'ביטחון שמירה וחקירות',
    'כלכלה ושוק ההון',
    'משאבי אנוש',
    'שיווק',
    'חינוך והדרכה',
    'משפטים',
    'אדריכלות ועיצוב',
    'תקשורת',
    'תיירות ומלונאות',
    'מזון ומסעדנות',
  ];

  // Categories by region (אזור)
  private readonly regionCategories: string[] = [
    'צפון',
    'שרון',
    'מרכז',
    'ירושלים',
    'שפלה',
    'דרום',
  ];

  // Categories by job characteristics (מאפייני משרה)
  private readonly characteristicCategories: string[] = [
    'עבודה מהבית',
    'משרות ממשלתיות',
    'משרה בכירה',
    'עבודה בלילה',
    'כולל נסיעות לחו"ל',
    'עבודה מועדפת',
  ];

  // Categories by suitability (מתאים ל)
  private readonly suitabilityCategories: string[] = [
    'עבודה לנוער',
    'עבודה לסטודנטים',
    'ללא נסיון',
    'חיילים משוחררים',
    'אקדמאים ללא נסיון',
    'בני 50 פלוס',
  ];

  // Categories by job scope (היקף משרה)
  private readonly scopeCategories: string[] = [
    'משרה מלאה',
    'משמרות',
    'משרה חלקית',
    'עבודה זמנית',
    'פרילאנס',
  ];

  // Additional categories from website footer
  private readonly additionalCategories: string[] = [
    'נהגים',
    'חקלאות',
    'עורכי דין',
    'משאבי אנוש',
    'שליחים',
    'עובדים סוציאלים',
    'אחיות',
    'מזכירה רפואית',
    'רופאים',
    'כלכלן',
    'חשב שכר',
    'ביוטק',
    'אבטחת מידע',
    'QA',
    'מהנדס חשמל',
    'שמאי מקרקעין',
    'מערכות מידע',
    'סוכני שטח',
    'יועץ משפטי',
    'אדריכלים',
    'מורים',
    'שליחים עם רכב',
    'ממשלתיות',
    'התמחות',
    'בכירים',
    'עבודה היברידית',
  ];

  // General search terms (for comprehensive coverage)
  private readonly generalCategories: string[] = [
    '*', // All jobs
    'מנהל',
    'מפתח',
    'מהנדס',
    'רופא',
    'מורה',
    'אדריכל',
    'עורך דין',
    'יועץ',
    'מעצב',
    'טבח',
    'מלצר',
    'קופאי',
    'נהג',
    'שליח',
    'מטפלת',
    'אחיות',
  ];

  /**
   * Gets all categories to scrape
   * COMPREHENSIVE: All categories for complete coverage without duplicates
   */
  /**
   * Gets all categories to scrape
   * COMPREHENSIVE: All categories for complete coverage without duplicates
   * Optimized order: Start with wildcard, then most common categories
   * 
   * JobMaster URL structure: /jobs/?q={category}
   * Categories can be:
   * - Field names (תחום): מכירות, מחשבים ותוכנה, etc.
   * - Region names (אזור): צפון, מרכז, etc.
   * - Job characteristics: עבודה מהבית, משרה בכירה, etc.
   * - Suitability: ללא נסיון, חיילים משוחררים, etc.
   * - Job scope: משרה מלאה, משמרות, etc.
   * - General terms: מנהל, מפתח, etc.
   * - Wildcard: * (gets all jobs)
   */
  private getAllCategories(): string[] {
    // Return ALL categories - duplicates are handled by scrapedJobIds Set
    // This ensures we get every job from every category
    // Order: Start with wildcard (gets most jobs quickly), then field categories (most important),
    // then regions, then other filters
    return [
      '*', // All jobs - gets most jobs immediately (should be first)
      // All field categories (complete coverage) - these are the most important
      ...this.fieldCategories,
      // All regions (complete coverage) - important for geographic coverage
      ...this.regionCategories,
      // All job characteristics (complete coverage)
      ...this.characteristicCategories,
      // All suitability categories (complete coverage)
      ...this.suitabilityCategories,
      // All job scope categories (complete coverage)
      ...this.scopeCategories,
      // Additional categories from website footer
      ...this.additionalCategories,
      // All general categories (complete coverage) - these are more specific searches
      ...this.generalCategories.filter(c => c !== '*'), // Remove duplicate '*'
    ];
  }

  constructor(
    httpClient: HttpClient,
    parser: JobMasterParser,
    paginationManager: JobMasterPaginationManager,
    _exporter: DataExporter,
    logger: ReturnType<typeof createLogger>,
    database: JobMasterDatabaseManager,
    baseUrl: string
  ) {
    this.httpClient = httpClient;
    this.parser = parser;
    this.paginationManager = paginationManager;
    this.logger = logger;
    this.database = database;
    this.baseUrl = baseUrl;
  }

  /**
   * Sets the session ID for incremental updates
   */
  setSessionId(sessionId: number): void {
    this.sessionId = sessionId;
  }

  /**
   * Scrapes all categories
   */
  async scrapeAllCategories(options: {
    maxPagesPerCategory?: number;
    maxConsecutiveEmptyPages?: number;
  } = {}): Promise<{
    totalCategoriesScraped: number;
    totalPagesScraped: number;
    totalJobsFound: number;
  }> {
    // Increase max pages per category to get more jobs
    const maxPagesPerCategory = options.maxPagesPerCategory || 200; // Increased to 200 for comprehensive coverage
    const maxConsecutiveEmptyPages = options.maxConsecutiveEmptyPages || 20; // Increased to 20 - don't stop on gaps

    let totalCategoriesScraped = 0;
    let totalPagesScraped = 0;
    let totalJobsFound = 0;

    const allCategories = this.getAllCategories();
    this.logger.info('Starting multi-category scraping', {
      categoriesCount: allCategories.length,
      maxPagesPerCategory,
      fieldCategories: this.fieldCategories.length,
      regionCategories: this.regionCategories.length,
      characteristicCategories: this.characteristicCategories.length,
      suitabilityCategories: this.suitabilityCategories.length,
      scopeCategories: this.scopeCategories.length,
    });

    for (const category of allCategories) {
      try {
        this.logger.info(`═══════════════════════════════════════════════════════`);
        this.logger.info(`🔄 STARTING CATEGORY: ${category}`, {
          category,
          categoryIndex: totalCategoriesScraped + 1,
          totalCategories: allCategories.length,
          totalJobsSoFar: totalJobsFound,
          totalPagesSoFar: totalPagesScraped,
        });
        this.logger.info(`═══════════════════════════════════════════════════════`);

        // Build URL with proper encoding and parameters
        // JobMaster supports: /jobs/?q={query}&position={position_id}&type={type_id}&city={city_id}&region={region_id}
        // For now, we use q parameter for all categories
        let startUrl = `${this.baseUrl}/jobs/?q=${encodeURIComponent(category)}`;
        
        // If category matches known position IDs, we could use position parameter
        // But for now, q parameter works for all categories
        this.logger.info(`Category URL: ${startUrl}`);
        
        const result = await this.scrapeCategory(startUrl, {
          maxPages: maxPagesPerCategory,
          maxConsecutiveEmptyPages,
        });

        totalCategoriesScraped++;
        totalPagesScraped += result.pagesScraped;
        totalJobsFound += result.jobsFound;

        // Update session after each category
        if (this.sessionId !== null) {
          this.database.updateScrapingSession(this.sessionId, {
            pagesScraped: totalPagesScraped,
            jobsFound: totalJobsFound,
            status: 'running',
          });
        }

        this.logger.info(`✅ COMPLETED CATEGORY: ${category}`, {
          category,
          pagesScraped: result.pagesScraped,
          jobsFound: result.jobsFound,
          totalJobsSoFar: totalJobsFound,
          totalPagesSoFar: totalPagesScraped,
          categoriesRemaining: allCategories.length - totalCategoriesScraped,
        });
        this.logger.info(`═══════════════════════════════════════════════════════`);

        // Minimal delay between categories for speed
        await this.delay(50);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ FAILED CATEGORY: ${category}`, {
          category,
          categoryIndex: totalCategoriesScraped + 1,
          totalCategories: allCategories.length,
          error: errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        
        // Log error activity
        try {
          const activityLogger = ActivityLogger.getInstance();
          activityLogger.logError('jobmaster', errorMessage, {
            category,
            page: 0,
          });
        } catch {
          // ActivityLogger not initialized, skip
        }
        
        // Continue with next category - don't stop on single category failure
        this.logger.info(`⏭️  Continuing to next category...`);
      }
    }

    this.logger.info('Multi-category scraping completed', {
      totalCategoriesScraped,
      totalPagesScraped,
      totalJobsFound,
    });

    return {
      totalCategoriesScraped,
      totalPagesScraped,
      totalJobsFound,
    };
  }

  /**
   * Scrapes a single category
   */
  private async scrapeCategory(
    startUrl: string,
    options: {
      maxPages: number;
      maxConsecutiveEmptyPages: number;
    }
  ): Promise<{
    pagesScraped: number;
    jobsFound: number;
  }> {
    let currentUrl: string | null = startUrl;
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    let pagesScraped = 0;
    let jobsFound = 0;
    const scrapedUrls = new Set<string>();

    this.logger.info(`📂 Starting category scraping`, {
      startUrl,
      maxPages: options.maxPages,
      maxConsecutiveEmptyPages: options.maxConsecutiveEmptyPages,
    });

    while (currentUrl && currentPage <= options.maxPages) {
      try {
        // Check if we've already scraped this URL
        if (scrapedUrls.has(currentUrl)) {
          this.logger.warn('⚠️ Already scraped this URL, stopping category', {
            url: currentUrl,
            page: currentPage,
          });
          break;
        }

        scrapedUrls.add(currentUrl);

        this.logger.info(`📄 Scraping page ${currentPage}`, { 
          url: currentUrl,
          pagesScraped,
          jobsFound,
        });

        // Fetch page
        const response = await this.httpClient.get(currentUrl);
        const html = response.data;

        // Parse jobs from page
        const jobs = this.parser.parseJobListings(html, currentUrl);
        
        // Log parsing activity
        try {
          const activityLogger = ActivityLogger.getInstance();
          activityLogger.logParsing('jobmaster', startUrl, currentPage, jobs.length);
        } catch {
          // ActivityLogger not initialized, skip
        }
        
        // Filter out already scraped jobs
        const newJobs = jobs.filter(job => {
          if (this.scrapedJobIds.has(job.jobId)) {
            return false;
          }
          this.scrapedJobIds.add(job.jobId);
          return true;
        });

        // Fetch full job details for each new job to get complete information
        // This includes: full description, full requirements, category, targetAudience
        const jobsToSave: typeof newJobs = [];
        for (const job of newJobs) {
          try {
            const fullDetails = await this.parser.parseFullJobDetails(job.applicationUrl, this.httpClient);
            if (fullDetails) {
              // Merge full details with listing data
              const enrichedJob = {
                ...job,
                description: fullDetails.description || job.description,
                requirements: fullDetails.requirements || job.requirements,
                category: fullDetails.category || job.category,
                targetAudience: fullDetails.targetAudience || job.targetAudience,
              };
              jobsToSave.push(enrichedJob);
            } else {
              // If full details fetch failed, use listing data
              jobsToSave.push(job);
            }
          } catch (error) {
            // If full details fetch failed, use listing data
            this.logger.debug('Failed to fetch full details, using listing data', {
              jobId: job.jobId,
              error: error instanceof Error ? error.message : String(error),
            });
            jobsToSave.push(job);
          }
        }
        
        this.logger.info(`📊 Page ${currentPage}: ${jobs.length} total, ${newJobs.length} new, ${jobs.length - newJobs.length} duplicates`, {
          category: startUrl,
          page: currentPage,
          total: jobs.length,
          new: newJobs.length,
          duplicates: jobs.length - newJobs.length,
          totalJobsInCategory: jobsFound,
          totalPagesInCategory: pagesScraped,
        });

        // Track empty pages - count pages with only duplicates as "empty" for stopping logic
        // This prevents the scraper from continuing indefinitely when all jobs are duplicates
        if (jobs.length === 0) {
          consecutiveEmptyPages++;
          this.logger.debug('Empty page detected (no jobs found)', {
            consecutiveEmptyPages,
            category: startUrl,
            page: currentPage,
          });
        } else if (newJobs.length === 0) {
          // Page has jobs but all are duplicates - count towards empty pages
          consecutiveEmptyPages++;
          this.logger.debug('Page with only duplicates detected', {
            consecutiveEmptyPages,
            category: startUrl,
            page: currentPage,
            totalJobs: jobs.length,
          });
        } else {
          // Reset counter if we found NEW jobs
          consecutiveEmptyPages = 0;
        }
        
        // Only stop if we have MANY consecutive pages with no new jobs
        if (consecutiveEmptyPages >= options.maxConsecutiveEmptyPages) {
          this.logger.info('Too many consecutive pages with no new jobs, stopping category', {
            consecutiveEmptyPages,
            category: startUrl,
            page: currentPage,
            totalJobsFound: jobsFound,
          });
          break;
        }

        // Save new jobs to database
        if (jobsToSave.length > 0 && this.database) {
          try {
            this.database.upsertJobs(jobsToSave);
            jobsFound += jobsToSave.length;
            pagesScraped++;
            
            // Log database activity
            try {
              const activityLogger = ActivityLogger.getInstance();
              activityLogger.logDatabase('jobmaster', 'upsertJobs', jobsToSave.length);
            } catch {
              // ActivityLogger not initialized, skip
            }
            
            // Update session incrementally
            if (this.sessionId !== null) {
              this.database.updateScrapingSession(this.sessionId, {
                pagesScraped,
                jobsFound,
                status: 'running',
              });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to save jobs to database', {
              error: errorMessage,
            });
            
            // Log error activity
            try {
              const activityLogger = ActivityLogger.getInstance();
              activityLogger.logError('jobmaster', errorMessage, {
                operation: 'upsertJobs',
                url: currentUrl,
                page: currentPage,
              });
            } catch {
              // ActivityLogger not initialized, skip
            }
          }
        } else if (jobs.length > 0) {
          // Even if all jobs were duplicates, count the page
          pagesScraped++;
          
          // Update session incrementally even for duplicate pages
          if (this.sessionId !== null) {
            this.database.updateScrapingSession(this.sessionId, {
              pagesScraped,
              jobsFound,
              status: 'running',
            });
          }
        } else {
          // No jobs found on page - still update session to show progress
          pagesScraped++;
          if (this.sessionId !== null) {
            this.database.updateScrapingSession(this.sessionId, {
              pagesScraped,
              jobsFound,
              status: 'running',
            });
          }
        }

        // Get next page URL - always try to construct next page even if pagination manager says no
        const nextUrl = this.paginationManager.getNextPageUrl(html, currentUrl, currentPage);
        
        // If pagination manager returns null, try to construct URL ourselves
        let finalNextUrl = nextUrl;
        if (!nextUrl || nextUrl === currentUrl) {
          // Try to construct next page URL manually
          try {
            const url: URL = new URL(currentUrl);
            const currentPageNum = parseInt(url.searchParams.get('currPage') || '1', 10);
            const nextPageNum = currentPageNum + 1;
            
            // Only continue if we haven't exceeded max pages
            if (nextPageNum <= options.maxPages) {
              url.searchParams.set('currPage', nextPageNum.toString());
              finalNextUrl = url.toString();
              this.logger.debug('Constructed next page URL manually', {
                currentPage: currentPageNum,
                nextPage: nextPageNum,
                url: finalNextUrl,
              });
            } else {
              this.logger.info('Reached max pages limit', {
                category: startUrl,
                page: currentPage,
                maxPages: options.maxPages,
              });
              break;
            }
          } catch (urlError) {
            this.logger.warn('Failed to construct next page URL', {
              error: urlError instanceof Error ? urlError.message : String(urlError),
              category: startUrl,
              page: currentPage,
            });
            break;
          }
        }
        
        if (!finalNextUrl || finalNextUrl === currentUrl) {
          this.logger.info(`🏁 Reached end of category - no more pages`, {
            category: startUrl,
            page: currentPage,
            pagesScraped,
            jobsFound,
            maxPages: options.maxPages,
          });
          break;
        }
        
        this.logger.info(`➡️ Moving to next page: ${currentPage + 1}`, {
          currentUrl: finalNextUrl,
        });
        
        currentUrl = finalNextUrl;
        currentPage++;

        // EXTREME: No additional delay - HttpClient handles all rate limiting (100ms)
        // Removed delay completely for maximum speed
      } catch (error) {
        this.logger.error(`Failed to scrape page ${currentPage}`, {
          url: currentUrl,
          error: error instanceof Error ? error.message : String(error),
          category: startUrl,
          pagesScraped,
          jobsFound,
        });
        // Don't break immediately - try to continue
        // Only break if we've had multiple consecutive errors
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= options.maxConsecutiveEmptyPages) {
          this.logger.warn('Too many consecutive errors, stopping category', {
            category: startUrl,
            consecutiveEmptyPages,
          });
          break;
        }
        // Try to continue to next page
        try {
          const nextUrl = this.paginationManager.getNextPageUrl('', currentUrl, currentPage);
          if (nextUrl && nextUrl !== currentUrl) {
            currentUrl = nextUrl;
            currentPage++;
            await this.delay(500); // Delay after error (minimized)
          } else {
            break;
          }
        } catch (nextPageError) {
          this.logger.error('Failed to get next page after error', {
            error: nextPageError instanceof Error ? nextPageError.message : String(nextPageError),
          });
          break;
        }
      }
    }

    this.logger.info(`✅ Category scraping completed`, {
      startUrl,
      pagesScraped,
      jobsFound,
      finalPage: currentPage,
    });

    return {
      pagesScraped,
      jobsFound,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


