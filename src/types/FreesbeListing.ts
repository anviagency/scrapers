import { z } from 'zod';

/**
 * Zod schema for Freesbe listing
 */
export const FreesbeListingSchema = z.object({
  carId: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number().nullable().optional(),
  version: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  monthlyPayment: z.number().nullable().optional(),
  mileage: z.number().nullable().optional(),
  hand: z.number().nullable().optional(), // יד (1, 2, etc.)
  transmission: z.string().nullable().optional(), // אוטומטי, ידני
  fuelType: z.string().nullable().optional(), // בנזין, דיזל, היברידי, חשמלי
  location: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  aggregatedData: z.record(z.unknown()).optional(), // JSON object with all aggregated data
  images: z.array(z.string()).optional(),
  listingUrl: z.string(),
  postedDate: z.string().nullable().optional(),
});

/**
 * TypeScript type for Freesbe listing
 */
export type FreesbeListing = z.infer<typeof FreesbeListingSchema>;

