import type { Logger } from '../../utils/logger';
import type { MadlanListing } from '../../types/MadlanListing';
import type { MadlanProject } from '../../types/MadlanProject';
import { AgentType, ListingType } from '../../types/MadlanListing';

/**
 * Parser for Madlan GraphQL API responses
 * Converts GraphQL data to MadlanListing and MadlanProject objects
 */
export class MadlanGraphQLParser {
  private readonly logger: Logger;
  private readonly baseUrl: string;

  constructor(logger: Logger, baseUrl: string = 'https://www.madlan.co.il') {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Parse GraphQL POI data into listings and projects
   */
  parsePoiData(poiData: any[], listingType: ListingType): {
    listings: MadlanListing[];
    projects: MadlanProject[];
  } {
    const listings: MadlanListing[] = [];
    const projects: MadlanProject[] = [];

    for (const poi of poiData) {
      if (!poi || !poi.type) {
        continue;
      }

      try {
        if (poi.type === 'bulletin' || poi.type === 'CommercialBulletin') {
          const listing = this.parseBulletin(poi, listingType);
          if (listing) {
            listings.push(listing);
          }
        } else if (poi.type === 'project') {
          const project = this.parseProject(poi);
          if (project) {
            projects.push(project);
          }
        }
      } catch (error) {
        this.logger.warn('Failed to parse POI', {
          error: error instanceof Error ? error.message : String(error),
          poiId: poi.id,
          poiType: poi.type,
        });
      }
    }

    return { listings, projects };
  }

  /**
   * Parse a Bulletin (listing) from GraphQL response
   */
  private parseBulletin(poi: any, listingType: ListingType): MadlanListing | null {
    try {
      const addressDetails = poi.addressDetails || {};
      const poc = poi.poc || {};
      const amenities = poi.amenities || {};

      // Determine agent type
      let agentType: AgentType = AgentType.PRIVATE;
      let agentName: string | undefined;
      let agentPhone: string | undefined;

      if (poc.type === 'private') {
        agentType = AgentType.PRIVATE;
        agentName = poc.contactInfo?.name;
        agentPhone = poc.displayNumber || poc.contactInfo?.phone;
      } else if (poc.type === 'agent') {
        agentType = AgentType.AGENT;
        agentName = poc.agentContact?.name || poc.name;
        agentPhone = poc.displayNumber || poc.agentContact?.phone;
      } else if (poc.type === 'new_construction') {
        agentType = AgentType.NEW_CONSTRUCTION;
        agentName = poc.name;
        agentPhone = poc.displayNumber;
      }

      // Build listing URL
      let listingUrl: string;
      if (poi.originalId && !['bmby', 'YAD2'].includes(poi.originalId)) {
        listingUrl = `${this.baseUrl}/listings/${poi.originalId}`;
      } else {
        listingUrl = `${this.baseUrl}/listings/${poi.id}`;
      }

      // Skip homely listings
      if (listingUrl.includes('homely')) {
        return null;
      }

      // Parse images
      const images: string[] = [];
      if (poi.images && Array.isArray(poi.images)) {
        for (const img of poi.images) {
          if (img.imageUrl) {
            // Use the same image URL format as the old scraper
            const imageUrl = `https://images2.madlan.co.il/t:nonce:v=2;resize:height=502;convert:type=webp/${img.imageUrl}`;
            images.push(imageUrl);
          }
        }
      }

      // Parse features from amenities
      const features: string[] = [];
      if (amenities.airConditioner) features.push('מיזוג אוויר');
      if (amenities.elevator) features.push('מעלית');
      if (amenities.balcony) features.push('מרפסת');
      if (amenities.parking) features.push('חניה');
      if (amenities.secureRoom) features.push('ממ"ד');
      if (amenities.grating) features.push('סורגים');
      if (amenities.pandoorDoors) features.push('דלתות פנדור');
      if (amenities.accessible) features.push('נגיש לנכים');
      if (amenities.storage) features.push('מחסן');
      if (amenities.garden) features.push('גינה');
      if (amenities.pool) features.push('בריכה');
      if (amenities.gym) features.push('מכון כושר');
      if (amenities.doorman) features.push('שומר');

      // Parse dates
      const postedDate = poi.firstTimeSeen
        ? this.parseDate(poi.firstTimeSeen)
        : undefined;
      const updatedDate = poi.lastUpdated
        ? this.parseDate(poi.lastUpdated)
        : postedDate;

      const listing: MadlanListing = {
        listingId: poi.originalId || poi.id,
        title: this.buildTitle(poi, addressDetails),
        price: poi.price || null,
        propertyType: poi.buildingClass || null,
        areaSqm: poi.area || null,
        rooms: poi.beds || null,
        floor: poi.floor?.toString() || null,
        address: this.buildAddress(addressDetails) || undefined,
        city: addressDetails.city || undefined,
        neighborhood: addressDetails.neighbourhood || undefined,
        description: poi.description || undefined,
        features: features.length > 0 ? features : undefined,
        agentType,
        agentName,
        agentPhone,
        listingType,
        listingUrl,
        postedDate,
        updatedDate,
      };

      return listing;
    } catch (error) {
      this.logger.error('Failed to parse bulletin', {
        error: error instanceof Error ? error.message : String(error),
        poiId: poi.id,
      });
      return null;
    }
  }

  /**
   * Parse a Project from GraphQL response
   */
  private parseProject(poi: any): MadlanProject | null {
    try {
      const addressDetails = poi.addressDetails || {};

      const project: MadlanProject = {
        projectId: poi.id,
        projectName: poi.projectName || 'Untitled Project',
        developer: poi.developers?.[0]?.name || undefined,
        address: this.buildAddress(addressDetails) || undefined,
        description: poi.projectMessages?.developerDescription || poi.projectMessages?.benefits || undefined,
        units: poi.blockDetails?.units || null,
        floors: null, // Not available in GraphQL
        completionDate: null, // Not available in GraphQL
        priceFrom: poi.priceRange?.min || null,
        priceTo: poi.priceRange?.max || null,
        pricePerSqm: null, // Not available in GraphQL
        constructionStart: null, // Not available in GraphQL
        constructionEnd: null, // Not available in GraphQL
        deliveryDates: undefined, // Not available in GraphQL
        projectUrl: `${this.baseUrl}/projects/${poi.id}`,
        imageUrls: poi.images?.map((img: any) => img.path || img.imageUrl).filter(Boolean) || undefined,
      };

      return project;
    } catch (error) {
      this.logger.error('Failed to parse project', {
        error: error instanceof Error ? error.message : String(error),
        poiId: poi.id,
      });
      return null;
    }
  }

  /**
   * Build title from POI data
   */
  private buildTitle(poi: any, addressDetails: any): string {
    const parts: string[] = [];

    if (poi.beds) {
      parts.push(`${poi.beds} חדרים`);
    }
    if (poi.area) {
      parts.push(`${poi.area} מ"ר`);
    }
    if (addressDetails.streetName) {
      parts.push(addressDetails.streetName);
    }
    if (addressDetails.city) {
      parts.push(addressDetails.city);
    }

    return parts.length > 0 ? parts.join(' - ') : 'Untitled Listing';
  }

  /**
   * Build address string from address details
   */
  private buildAddress(addressDetails: any): string | null {
    const parts: string[] = [];

    if (addressDetails.streetName) {
      parts.push(addressDetails.streetName);
    }
    if (addressDetails.streetNumber) {
      parts.push(addressDetails.streetNumber);
    }
    if (addressDetails.neighbourhood) {
      parts.push(addressDetails.neighbourhood);
    }
    if (addressDetails.city) {
      parts.push(addressDetails.city);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Parse ISO date string to YYYY-MM-DD format
   */
  private parseDate(dateString: string): string | null {
    try {
      if (!dateString) return null;
      const dt = new Date(dateString.replace('Z', '+00:00'));
      return dt.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }
}

