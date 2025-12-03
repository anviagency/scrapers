import { z } from 'zod';

/**
 * Listing type enum
 */
export enum ListingType {
  SALE = 'sale',
  RENT = 'rent',
  COMMERCIAL = 'commercial',
}

/**
 * Agent type enum
 */
export enum AgentType {
  PRIVATE = 'private',
  AGENT = 'agent',
  NEW_CONSTRUCTION = 'new_construction',
}

/**
 * Zod schema for Madlan listing
 */
export const MadlanListingSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  price: z.number().nullable().optional(),
  propertyType: z.string().optional(), // e.g., "דירה", "בית", "דופלקס"
  areaSqm: z.number().nullable().optional(),
  rooms: z.number().nullable().optional(),
  floor: z.string().nullable().optional(), // Can be "קרקע", "מרתף", number, etc.
  address: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()).optional(), // e.g., ["ממ"ד", "מעלית", "חניה"]
  agentType: z.nativeEnum(AgentType),
  agentName: z.string().nullable().optional(),
  agentPhone: z.string().nullable().optional(),
  listingType: z.nativeEnum(ListingType),
  listingUrl: z.string(),
  postedDate: z.string().nullable().optional(),
  updatedDate: z.string().nullable().optional(),
  imageUrls: z.array(z.string()).optional(),
});

/**
 * TypeScript type for Madlan listing
 */
export type MadlanListing = z.infer<typeof MadlanListingSchema>;

