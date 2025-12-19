import type { HttpClient } from '../../http/HttpClient';
import type { Logger } from '../../utils/logger';
import { SitemapParser, type SitemapEntry } from './SitemapParser';
import { JobDetailParser } from './JobDetailParser';
import type { SitemapScraperConfig } from './config';
import type { JobListing } from '../../types/JobListing';

/**
 * Scraping progress callback
 */
export interface ScrapeProgressCallback {
  (progress: {
    completed: number;
    total: number;
    successful: number;
    failed: number;
    currentUrl?: string;
  }): void;
}

/**
 * Scraping result
 */
export interface ScrapeResult {
  jobs: JobListing[];
  totalProcessed: number;
  successful: number;
  failed: number;
  failedUrls: string[];
  durationMs: number;
}

/**
 * AllJobs Sitemap Scraper
 * Fetches job URLs from sitemap and scrapes each job detail page with concurrency control
 */
export class AllJobsSitemapScraper {
  private readonly httpClient: HttpClient;
  private readonly logger: Logger;
  private readonly config: SitemapScraperConfig;
  private readonly sitemapParser: SitemapParser;
  private readonly jobDetailParser: JobDetailParser;

  constructor(
    httpClient: HttpClient,
    logger: Logger,
    config: SitemapScraperConfig
  ) {
    this.httpClient = httpClient;
    this.logger = logger;
    this.config = config;
    this.sitemapParser = new SitemapParser(logger);
    this.jobDetailParser = new JobDetailParser(logger);
  }

  /**
   * Fetch sitemap and extract job URLs
   * @returns Array of sitemap entries
   */
  async fetchSitemap(): Promise<SitemapEntry[]> {
    this.logger.info('Fetching sitemap', { url: this.config.sitemapUrl });

    try {
      const response = await this.httpClient.get(this.config.sitemapUrl);
      const xmlContent = response.data;

      this.logger.debug('Sitemap fetched', {
        contentLength: xmlContent.length,
        status: response.status,
      });

      // Parse sitemap
      let entries = this.sitemapParser.parseXml(xmlContent);
      entries = this.sitemapParser.filterValidEntries(entries);
      entries = this.sitemapParser.removeDuplicates(entries);

      this.logger.info('Sitemap parsed', {
        totalEntries: entries.length,
      });

      return entries;
    } catch (error) {
      this.logger.error('Failed to fetch sitemap', {
        url: this.config.sitemapUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Scrape a single job detail page
   * @param entry - Sitemap entry with job URL
   * @returns Job listing or null if failed
   */
  async scrapeJobPage(entry: SitemapEntry): Promise<JobListing | null> {
    try {
      const response = await this.httpClient.get(entry.url);
      const html = response.data;

      const job = this.jobDetailParser.parseJobDetailPage(html, entry.jobId, entry.url);

      if (job) {
        this.logger.debug('Successfully scraped job', {
          jobId: entry.jobId,
          title: job.title,
        });
      } else {
        this.logger.warn('Failed to parse job page', {
          jobId: entry.jobId,
          url: entry.url,
        });
      }

      return job;
    } catch (error) {
      this.logger.error('Failed to fetch job page', {
        jobId: entry.jobId,
        url: entry.url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Scrape all jobs from sitemap with concurrency control
   * @param onProgress - Optional progress callback
   * @returns Scraping results
   */
  async scrapeAll(onProgress?: ScrapeProgressCallback): Promise<ScrapeResult> {
    const startTime = Date.now();
    const jobs: JobListing[] = [];
    const failedUrls: string[] = [];

    // Fetch sitemap entries
    let entries = await this.fetchSitemap();

    // Apply offset
    if (this.config.offset > 0) {
      this.logger.info('Applying offset', {
        offset: this.config.offset,
        totalBefore: entries.length,
      });
      entries = entries.slice(this.config.offset);
    }

    // Apply limit
    if (this.config.limit > 0 && entries.length > this.config.limit) {
      this.logger.info('Applying limit', {
        limit: this.config.limit,
        totalBefore: entries.length,
      });
      entries = entries.slice(0, this.config.limit);
    }

    const total = entries.length;
    let completed = 0;
    let successful = 0;
    let failed = 0;

    this.logger.info('Starting to scrape jobs', {
      total,
      concurrency: this.config.concurrency,
      offset: this.config.offset,
      limit: this.config.limit || 'unlimited',
    });

    // Process entries with concurrency control
    await this.processWithConcurrency(
      entries,
      async (entry) => {
        const job = await this.scrapeJobPage(entry);

        completed++;

        if (job) {
          jobs.push(job);
          successful++;
        } else {
          failed++;
          failedUrls.push(entry.url);
        }

        // Report progress
        if (onProgress) {
          onProgress({
            completed,
            total,
            successful,
            failed,
            currentUrl: entry.url,
          });
        }

        // Log progress every 100 jobs
        if (completed % 100 === 0 || completed === total) {
          this.logger.info('Scraping progress', {
            completed,
            total,
            successful,
            failed,
            percentage: Math.round((completed / total) * 100),
          });
        }

        return job;
      },
      this.config.concurrency
    );

    const durationMs = Date.now() - startTime;

    this.logger.info('Scraping completed', {
      totalProcessed: completed,
      successful,
      failed,
      durationMs,
      jobsPerSecond: Math.round((successful / durationMs) * 1000),
    });

    return {
      jobs,
      totalProcessed: completed,
      successful,
      failed,
      failedUrls,
      durationMs,
    };
  }

  /**
   * Process items with concurrency control using a pool-based approach
   * @param items - Items to process
   * @param processor - Processing function
   * @param concurrency - Maximum concurrent operations
   * @returns Array of results
   */
  private async processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const results: R[] = [];
    let currentIndex = 0;

    // Worker function that processes items until none are left
    const worker = async (): Promise<void> => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        if (index >= items.length) break;

        const result = await processor(items[index]);
        results.push(result);
      }
    };

    // Start workers up to concurrency limit
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(concurrency, items.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    return results;
  }
}
