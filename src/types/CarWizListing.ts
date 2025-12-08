import { z } from 'zod';

/**
 * CarWiz listing schema based on GraphQL API structure
 */
export const CarWizListingSchema = z.object({
  // Core identification
  carId: z.string(),
  isTruck: z.boolean().optional(),
  detailsViewCount: z.number().optional(),
  
  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
  
  // Vehicle details - L1 (core data)
  plate: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  previousPrice: z.number().nullable().optional(),
  priceDiscount: z.boolean().optional(),
  priceDifference: z.number().optional(),
  kilometrage: z.number().nullable().optional(),
  hand: z.number().nullable().optional(),
  originalOwnerId: z.number().nullable().optional(),
  originalOwnerName: z.string().nullable().optional(),
  futureTradein: z.boolean().optional(),
  parallelImport: z.boolean().optional(),
  
  // Colors
  colorName: z.string().nullable().optional(),
  colorNameV2: z.string().nullable().optional(),
  
  // Warranty and checks
  warranty: z.string().nullable().optional(),
  warrantyMonths: z.number().nullable().optional(),
  commitmentToCheck: z.string().nullable().optional(),
  
  // License details
  licenseValidity: z.string().nullable().optional(),
  licenseCost: z.number().nullable().optional(),
  
  // Financing
  downPayment: z.number().nullable().optional(),
  monthlyPayment: z.number().nullable().optional(),
  
  // Technical specification - L2
  specification: z.object({
    makeName: z.string().nullable().optional(),
    modelName: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    finishLevel: z.string().nullable().optional(),
    engineDisplacement: z.number().nullable().optional(),
    doorsCount: z.number().nullable().optional(),
    gear: z.string().nullable().optional(),
    seatsCount: z.number().nullable().optional(),
    segment: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    fuelType: z.string().nullable().optional(),
  }).nullable().optional(),
  
  // Agency branch details
  agencyBranch: z.object({
    city: z.string().nullable().optional(),
    agencyId: z.number().nullable().optional(),
    address: z.string().nullable().optional(),
    areaName: z.string().nullable().optional(),
    district: z.string().nullable().optional(),
    longitude: z.number().nullable().optional(),
    latitude: z.number().nullable().optional(),
    phone: z.string().nullable().optional(),
    virtualPhone: z.string().nullable().optional(),
    agency: z.object({
      name: z.string().nullable().optional(),
      displayName: z.string().nullable().optional(),
      logo: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  
  // Insights (AI-ready data)
  insights: z.object({
    nodes: z.array(z.object({
      text: z.string().optional(),
      type: z.string().optional(),
      value: z.string().nullable().optional(),
    })).optional(),
  }).nullable().optional(),
  
  // Images - raw data from API (carFiles from GraphQL)
  images: z.object({
    nodes: z.array(z.object({
      name: z.string(),
      originalUrl: z.string(),
      type: z.string().optional(),
      angle: z.string().nullable().optional(),
      angleIndex: z.number().nullable().optional(),
    })).optional(),
  }).nullable().optional(),
  
  // Gallery images - manufacturer stock images (galleryFiles from GraphQL)
  jatoImages: z.object({
    nodes: z.array(z.object({
      url: z.string(),
      angle: z.string().nullable().optional(),
    })).optional(),
  }).nullable().optional(),
  
  // Computed image URLs
  imageUrls: z.array(z.string()).optional(),
  jatoImageUrls: z.array(z.string()).optional(),
  
  // Additional fields
  isAllowedTrading: z.boolean().optional(),
  
  // Computed fields
  listingUrl: z.string().optional(),
});

/**
 * TypeScript type for CarWiz listing
 */
export type CarWizListing = z.infer<typeof CarWizListingSchema>;
