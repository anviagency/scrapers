import { z } from 'zod';
import { ScraperConfigSchema } from './ScraperConfig';

/**
 * Schema for JobMaster scraper configuration
 */
export const JobMasterConfigSchema = z.object({
  baseUrl: z.string().url().default('https://www.jobmaster.co.il'),
  evomiProxyKey: z.string().min(1, 'Evomi proxy key is required'),
  evomiProxyEndpoint: z.string().optional(),
  rateLimitDelayMs: z.number().int().positive().default(2500),
  maxRetries: z.number().int().nonnegative().default(3),
  retryDelayMs: z.number().int().positive().default(1000),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  maxPages: z.number().int().positive().optional(),
  resumeFromPage: z.number().int().positive().optional(),
});

/**
 * TypeScript type for JobMaster scraper configuration
 */
export type JobMasterConfig = z.infer<typeof JobMasterConfigSchema>;

/**
 * Schema for AllJobs scraper configuration (alias for ScraperConfigSchema)
 */
export const AllJobsConfigSchema = ScraperConfigSchema;

/**
 * TypeScript type for AllJobs scraper configuration
 */
export type AllJobsConfig = z.infer<typeof AllJobsConfigSchema>;

/**
 * Schema for multi-source scraper configuration
 * Contains configurations for all supported job sources
 */
export const MultiSourceConfigSchema = z.object({
  alljobs: AllJobsConfigSchema,
  jobmaster: JobMasterConfigSchema,
});

/**
 * TypeScript type for multi-source scraper configuration
 */
export type MultiSourceConfig = z.infer<typeof MultiSourceConfigSchema>;

/**
 * Validates JobMaster configuration
 * @param config - Configuration object to validate
 * @returns Validation result with success flag and data/error
 */
export function validateJobMasterConfig(config: unknown): {
  success: boolean;
  data?: JobMasterConfig;
  error?: string;
} {
  const result = JobMasterConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

/**
 * Validates AllJobs configuration
 * @param config - Configuration object to validate
 * @returns Validation result with success flag and data/error
 */
export function validateAllJobsConfig(config: unknown): {
  success: boolean;
  data?: AllJobsConfig;
  error?: string;
} {
  const result = AllJobsConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

/**
 * Validates multi-source configuration
 * @param config - Configuration object to validate
 * @returns Validation result with success flag and data/error
 */
export function validateMultiSourceConfig(config: unknown): {
  success: boolean;
  data?: MultiSourceConfig;
  error?: string;
} {
  const result = MultiSourceConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

