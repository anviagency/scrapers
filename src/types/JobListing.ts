import { z } from 'zod';

/**
 * Schema for validating job listing data scraped from alljobs.co.il
 */
export const JobListingSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  title: z.string().min(1, 'Title is required'),
  company: z.string().min(1, 'Company name is required'),
  description: z.string().min(1, 'Description is required'),
  location: z.string().min(1, 'Location is required'),
  jobType: z.string().min(1, 'Job type is required'),
  requirements: z.string().optional(),
  applicationUrl: z.string().url().or(z.string().startsWith('/')),
  postedDate: z.string().optional(),
  companyId: z.string().optional(),
});

/**
 * TypeScript type for job listing data
 */
export type JobListing = z.infer<typeof JobListingSchema>;

