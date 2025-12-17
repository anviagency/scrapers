import { z } from 'zod';

/**
 * Schema for scraper configuration
 */
export const ScraperConfigSchema = z.object({
  baseUrl: z.string().url().default('https://www.alljobs.co.il'),
  evomiProxyKey: z.string().min(1, 'Evomi proxy key is required'),
  evomiProxyEndpoint: z.string().optional(),
  evomiProxyUsername: z.string().optional(),
  evomiProxyPassword: z.string().optional(),
  rateLimitDelayMs: z.number().int().positive().default(2500),
  maxRetries: z.number().int().nonnegative().default(3),
  retryDelayMs: z.number().int().positive().default(1000),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  maxPages: z.number().int().positive().optional(),
  resumeFromPage: z.number().int().positive().optional(),
});

/**
 * TypeScript type for scraper configuration
 */
export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;

