import { z } from 'zod';

/**
 * Zod schema for Madlan project
 */
export const MadlanProjectSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  address: z.string().optional(),
  developer: z.string().nullable().optional(),
  floors: z.number().nullable().optional(),
  units: z.number().nullable().optional(),
  completionDate: z.string().nullable().optional(), // Expected completion date
  priceFrom: z.number().nullable().optional(),
  priceTo: z.number().nullable().optional(),
  pricePerSqm: z.number().nullable().optional(),
  constructionStart: z.string().nullable().optional(),
  constructionEnd: z.string().nullable().optional(),
  deliveryDates: z.array(z.string()).optional(), // Array of delivery dates for different phases
  projectUrl: z.string(),
  description: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

/**
 * TypeScript type for Madlan project
 */
export type MadlanProject = z.infer<typeof MadlanProjectSchema>;

