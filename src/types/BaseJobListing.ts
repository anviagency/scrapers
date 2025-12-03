import { z } from 'zod';

/**
 * Job source enumeration
 * Represents the source website for job listings
 */
export enum JobSource {
  ALLJOBS = 'alljobs',
  JOBMASTER = 'jobmaster',
}

/**
 * Base schema for job listing data
 * Common fields shared across all job sources
 */
export const BaseJobListingSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  title: z.string().min(1, 'Title is required'),
  company: z.string().min(1, 'Company name is required'),
  description: z.string().min(1, 'Description is required'),
  location: z.string().min(1, 'Location is required'),
  jobType: z.string().min(1, 'Job type is required'),
  category: z.string().optional(), // Job category (e.g., "חשמל ואלקטרוניקה", "מהנדס אלקטרוניקה")
  requirements: z.string().optional(),
  targetAudience: z.string().optional(), // "המשרה מיועדת לנשים ולגברים כאחד" etc.
  applicationUrl: z.string().url().or(z.string().startsWith('/')),
  postedDate: z.string().optional(),
  companyId: z.string().optional(),
  source: z.nativeEnum(JobSource),
});

/**
 * Base TypeScript type for job listing data
 */
export type BaseJobListing = z.infer<typeof BaseJobListingSchema>;

