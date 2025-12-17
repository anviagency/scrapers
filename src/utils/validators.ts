import dotenv from 'dotenv';
import { ZodIssue } from 'zod';
import { ScraperConfigSchema, type ScraperConfig } from '../types/ScraperConfig';

// Load environment variables from .env file
dotenv.config();

/**
 * Loads and validates scraper configuration from environment variables
 * @returns Validated scraper configuration
 * @throws Error if configuration is invalid or required fields are missing
 */
export function loadConfig(): ScraperConfig {
  const config = {
    baseUrl: process.env.BASE_URL || 'https://www.alljobs.co.il',
    evomiProxyKey: process.env.EVOMI_PROXY_KEY,
    evomiProxyEndpoint: process.env.EVOMI_PROXY_ENDPOINT,
    evomiProxyUsername: process.env.EVOMI_PROXY_USERNAME,
    evomiProxyPassword: process.env.EVOMI_PROXY_PASSWORD,
    rateLimitDelayMs: process.env.RATE_LIMIT_DELAY_MS
      ? parseInt(process.env.RATE_LIMIT_DELAY_MS, 10)
      : 2500,
    maxRetries: process.env.MAX_RETRIES
      ? parseInt(process.env.MAX_RETRIES, 10)
      : 3,
    retryDelayMs: process.env.RETRY_DELAY_MS
      ? parseInt(process.env.RETRY_DELAY_MS, 10)
      : 1000,
    logLevel: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
    maxPages: process.env.MAX_PAGES
      ? parseInt(process.env.MAX_PAGES, 10)
      : undefined,
    resumeFromPage: process.env.RESUME_FROM_PAGE
      ? parseInt(process.env.RESUME_FROM_PAGE, 10)
      : undefined,
  };

  const result = ScraperConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Invalid configuration: ${errors}`);
  }

  return result.data;
}

