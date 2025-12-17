import type { HttpClient } from '../http/HttpClient';
import type { Logger } from '../utils/logger';

/**
 * Configuration for job detail fetching
 */
export interface JobDetailFetcherConfig {
  maxConcurrency?: number; // Max parallel requests (default: 10)
  timeoutMs?: number; // Timeout per request in milliseconds (default: 5000)
  retryAttempts?: number; // Number of retry attempts (default: 2)
  retryDelayMs?: number; // Delay between retries in milliseconds (default: 1000)
}

/**
 * Result of fetching a job detail page
 */
export interface JobDetailResult {
  jobId: string;
  html: string | null;
  success: boolean;
  error?: string;
}

/**
 * Utility class for fetching AllJobs job detail pages in parallel
 * Optimized for performance with configurable concurrency and retry logic
 */
export class AllJobsJobDetailFetcher {
  private readonly httpClient: HttpClient;
  private readonly logger: Logger;
  private readonly baseUrl: string;
  private readonly config: Required<JobDetailFetcherConfig>;
  // MEMORY FIX: Removed HTML cache - it was causing memory leaks by storing full HTML pages
  // Cache was growing unboundedly and consuming gigabytes of memory during long scraping sessions

  constructor(
    httpClient: HttpClient,
    logger: Logger,
    baseUrl: string = 'https://www.alljobs.co.il',
    config: JobDetailFetcherConfig = {}
  ) {
    this.httpClient = httpClient;
    this.logger = logger;
    this.baseUrl = baseUrl;
    this.config = {
      maxConcurrency: config.maxConcurrency || 10,
      timeoutMs: config.timeoutMs || 5000,
      retryAttempts: config.retryAttempts || 2,
      retryDelayMs: config.retryDelayMs || 1000,
    };
  }

  /**
   * Fetches job detail pages for multiple job IDs in parallel
   * Uses semaphore pattern to limit concurrency
   * @param jobIds - Array of job IDs to fetch
   * @param jobUrls - Optional array of full URLs (if not provided, URLs will be constructed)
   * @returns Array of results with HTML content or errors
   */
  async fetchJobDetails(
    jobIds: string[],
    jobUrls?: string[]
  ): Promise<JobDetailResult[]> {
    if (jobIds.length === 0) {
      return [];
    }

    this.logger.info(`Fetching details for ${jobIds.length} jobs`, {
      maxConcurrency: this.config.maxConcurrency,
    });

    const results: JobDetailResult[] = [];
    const semaphore = new Semaphore(this.config.maxConcurrency);

    // Create fetch tasks
    const tasks = jobIds.map(async (jobId, index) => {
      await semaphore.acquire();
      try {
        return await this.fetchSingleJobDetail(
          jobId,
          jobUrls?.[index]
        );
      } finally {
        semaphore.release();
      }
    });

    // Execute all tasks and collect results
    const fetchedResults = await Promise.all(tasks);
    results.push(...fetchedResults);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    this.logger.info(`Job detail fetching completed`, {
      total: results.length,
      success: successCount,
      failures: failureCount,
    });

    return results;
  }

  /**
   * Fetches a single job detail page with retry logic
   */
  private async fetchSingleJobDetail(
    jobId: string,
    jobUrl?: string
  ): Promise<JobDetailResult> {
    const url = jobUrl || `${this.baseUrl}/Search/UploadSingle.aspx?JobID=${jobId}`;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await Promise.race([
          this.httpClient.get(url),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), this.config.timeoutMs)
          ),
        ]);

        const html = response.data;

        return {
          jobId,
          html,
          success: true,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (attempt < this.config.retryAttempts) {
          this.logger.debug(`Retrying job detail fetch`, {
            jobId,
            attempt: attempt + 1,
            error: errorMessage,
          });
          await this.delay(this.config.retryDelayMs * (attempt + 1)); // Exponential backoff
        } else {
          this.logger.warn(`Failed to fetch job detail after ${this.config.retryAttempts + 1} attempts`, {
            jobId,
            error: errorMessage,
          });
          return {
            jobId,
            html: null,
            success: false,
            error: errorMessage,
          };
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      jobId,
      html: null,
      success: false,
      error: 'Unknown error',
    };
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Simple semaphore implementation for limiting concurrency
 */
class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(count: number) {
    this.available = count;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }

    return new Promise(resolve => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      if (resolve) {
        resolve();
      }
    } else {
      this.available++;
    }
  }
}

