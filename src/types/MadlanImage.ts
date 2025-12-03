import { z } from 'zod';

/**
 * Image type enum
 */
export enum ImageType {
  LISTING = 'listing',
  PROJECT = 'project',
}

/**
 * Zod schema for Madlan image metadata
 */
export const MadlanImageSchema = z.object({
  imageId: z.string(),
  listingId: z.string().nullable().optional(), // For listing images
  projectId: z.string().nullable().optional(), // For project images
  imageUrl: z.string(),
  localPath: z.string().nullable().optional(), // Path to downloaded image
  imageType: z.nativeEnum(ImageType),
  orderIndex: z.number().optional(), // Order of image in gallery
});

/**
 * TypeScript type for Madlan image
 */
export type MadlanImage = z.infer<typeof MadlanImageSchema>;

