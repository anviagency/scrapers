import { z } from 'zod';
import { BaseJobListingSchema, JobSource } from './BaseJobListing';

/**
 * Schema for validating job listing data scraped from jobmaster.co.il
 * Extends BaseJobListingSchema with JobMaster-specific source
 */
export const JobMasterJobListingSchema = BaseJobListingSchema.extend({
  source: z.literal(JobSource.JOBMASTER).default(JobSource.JOBMASTER),
});

/**
 * TypeScript type for JobMaster job listing data
 */
export type JobMasterJobListing = z.infer<typeof JobMasterJobListingSchema>;

