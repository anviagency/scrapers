import type { Logger } from '../../utils/logger';
import type { CarWizListing } from '../../types/CarWizListing';
import type { CarWizGraphQLNode } from './CarWizGraphQLClient';

/**
 * Parser for converting GraphQL API responses to CarWizListing objects
 */
export class CarWizGraphQLParser {
  private readonly logger: Logger;
  private readonly baseUrl: string = 'https://carwiz.co.il';

  constructor(logger: Logger, baseUrl: string = 'https://carwiz.co.il') {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Generate the correct listing URL for a car
   * Format: /used-cars/{carId}
   */
  private generateListingUrl(node: CarWizGraphQLNode): string {
    return `${this.baseUrl}/used-cars/${node.carId}`;
  }

  /**
   * Generate full image URLs from carFiles nodes
   * Only include IMAGE type (exclude VIDEO)
   * Uses originalUrl from the API which points to Google Cloud Storage
   */
  private generateImageUrls(carFiles: CarWizGraphQLNode['carFiles']): string[] {
    if (!carFiles?.nodes || carFiles.nodes.length === 0) {
      return [];
    }
    
    return carFiles.nodes
      .filter(file => file.type === 'IMAGE')
      .map(file => file.originalUrl);
  }

  /**
   * Extract gallery image URLs (stock/manufacturer images, already full URLs)
   */
  private extractGalleryImageUrls(galleryFiles: CarWizGraphQLNode['galleryFiles']): string[] {
    if (!galleryFiles?.nodes || galleryFiles.nodes.length === 0) {
      return [];
    }
    
    return galleryFiles.nodes.map(file => file.url);
  }

  /**
   * Parse GraphQL nodes into CarWizListing objects
   * @param nodes - Array of GraphQL nodes
   * @returns Array of parsed listings
   */
  parseListings(nodes: CarWizGraphQLNode[]): CarWizListing[] {
    const listings: CarWizListing[] = [];

    for (const node of nodes) {
      try {
        const listing: CarWizListing = {
          // Core identification
          carId: node.carId,
          isTruck: node.isTruck,
          detailsViewCount: node.detailsViewCount,
          
          // Timestamps
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          
          // Vehicle details - L1
          plate: node.plate,
          year: node.year,
          price: node.price,
          previousPrice: node.previousPrice,
          priceDiscount: node.priceDiscount,
          priceDifference: node.priceDifference,
          kilometrage: node.kilometrage,
          hand: node.hand,
          originalOwnerId: node.originalOwnerId,
          originalOwnerName: node.originalOwnerName,
          futureTradein: node.futureTradein,
          parallelImport: node.parallelImport,
          
          // Colors
          colorName: node.colorName,
          colorNameV2: node.colorNameV2,
          
          // Warranty and checks
          warranty: node.warranty,
          warrantyMonths: node.warrantyMonths,
          commitmentToCheck: node.commitmentToCheck,
          
          // License details
          licenseValidity: node.licenseValidity,
          licenseCost: node.licenseCost,
          
          // Financing
          downPayment: node.downPayment,
          monthlyPayment: node.monthlyPayment,
          
          // Technical specification - L2
          specification: node.specification ? {
            makeName: node.specification.makeName,
            modelName: node.specification.modelName,
            year: node.specification.year,
            finishLevel: node.specification.finishLevel,
            engineDisplacement: node.specification.engineDisplacement,
            doorsCount: node.specification.doorsCount,
            gear: node.specification.gear,
            seatsCount: node.specification.seatsCount,
            segment: node.specification.segment,
            category: node.specification.category,
            fuelType: node.specification.fuelType,
          } : null,
          
          // Agency branch
          agencyBranch: node.agencyBranch ? {
            city: node.agencyBranch.city,
            agencyId: node.agencyBranch.agencyId,
            address: node.agencyBranch.address,
            areaName: node.agencyBranch.areaName,
            district: node.agencyBranch.district,
            longitude: node.agencyBranch.longitude,
            latitude: node.agencyBranch.latitude,
            phone: node.agencyBranch.phone,
            virtualPhone: node.agencyBranch.virtualPhone,
            agency: node.agencyBranch.agency,
          } : null,
          
          // Insights
          insights: node.insights,
          
          // Images (carFiles = uploaded by agency, galleryFiles = manufacturer stock)
          images: node.carFiles,
          jatoImages: node.galleryFiles,
          imageUrls: this.generateImageUrls(node.carFiles),
          jatoImageUrls: this.extractGalleryImageUrls(node.galleryFiles),
          
          // Additional fields
          isAllowedTrading: node.isAllowedTrading,
          
          // Computed fields
          listingUrl: this.generateListingUrl(node),
        };

        listings.push(listing);
      } catch (error) {
        this.logger.error('Failed to parse CarWiz listing', {
          error: error instanceof Error ? error.message : String(error),
          carId: node.carId,
        });
      }
    }

    return listings;
  }
}
