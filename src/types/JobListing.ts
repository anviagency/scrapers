import { z } from 'zod';
import { BaseJobListingSchema, JobSource } from './BaseJobListing';

/**
 * Schema for validating job listing data scraped from alljobs.co.il
 * Extends BaseJobListingSchema with AllJobs-specific source
 */
export const JobListingSchema = BaseJobListingSchema.extend({
  source: z.literal(JobSource.ALLJOBS).default(JobSource.ALLJOBS),
});

/**
 * TypeScript type for AllJobs job listing data
 */
export type JobListing = z.infer<typeof JobListingSchema>;

