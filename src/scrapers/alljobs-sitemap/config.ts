/**
 * Configuration for AllJobs Sitemap Scraper
 */

export interface SitemapScraperConfig {
  /** Sitemap URL to fetch job URLs from */
  sitemapUrl: string;
  /** Maximum number of concurrent requests */
  concurrency: number;
  /** Rate limit delay between requests in milliseconds */
  rateLimitDelayMs: number;
  /** Maximum retries for failed requests */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
  /** Whether to use proxy */
  useProxy: boolean;
  /** Output directory for CSV files */
  outputDir: string;
  /** Limit number of jobs to scrape (for testing, 0 = no limit) */
  limit: number;
  /** Skip first N jobs (useful for resuming) */
  offset: number;
}

/**
 * Default configuration
 */
export const defaultConfig: SitemapScraperConfig = {
  sitemapUrl: 'https://www.alljobs.co.il/sitemap/JobsActual_PC.xml',
  concurrency: 50,
  rateLimitDelayMs: 100, // Low delay since we have high concurrency
  maxRetries: 3,
  retryDelayMs: 1000,
  useProxy: true,
  outputDir: './output/alljobs-sitemap',
  limit: 0, // No limit by default
  offset: 0,
};

/**
 * Get configuration from environment variables with defaults
 */
export function getConfig(overrides: Partial<SitemapScraperConfig> = {}): SitemapScraperConfig {
  return {
    sitemapUrl: process.env.SITEMAP_URL || defaultConfig.sitemapUrl,
    concurrency: parseInt(process.env.CONCURRENCY || '', 10) || overrides.concurrency || defaultConfig.concurrency,
    rateLimitDelayMs: parseInt(process.env.RATE_LIMIT_DELAY_MS || '', 10) || overrides.rateLimitDelayMs || defaultConfig.rateLimitDelayMs,
    maxRetries: parseInt(process.env.MAX_RETRIES || '', 10) || overrides.maxRetries || defaultConfig.maxRetries,
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '', 10) || overrides.retryDelayMs || defaultConfig.retryDelayMs,
    useProxy: process.env.USE_PROXY === 'true' || (overrides.useProxy ?? defaultConfig.useProxy),
    outputDir: process.env.OUTPUT_DIR || overrides.outputDir || defaultConfig.outputDir,
    limit: parseInt(process.env.LIMIT || '', 10) || overrides.limit || defaultConfig.limit,
    offset: parseInt(process.env.OFFSET || '', 10) || overrides.offset || defaultConfig.offset,
    ...overrides,
  };
}
