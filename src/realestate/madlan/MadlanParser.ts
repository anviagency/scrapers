import * as cheerio from 'cheerio';
import type { Logger } from '../../utils/logger';
import type { MadlanListing } from '../../types/MadlanListing';
import type { MadlanProject } from '../../types/MadlanProject';
import { AgentType, ListingType } from '../../types/MadlanListing';

/**
 * Parser for Madlan real estate listings and projects
 * Extracts data from HTML pages
 */
export class MadlanParser {
  private readonly logger: Logger;
  private readonly baseUrl: string;

  constructor(logger: Logger, baseUrl: string = 'https://www.madlan.co.il') {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Parses listing listings from a search results page
   * @param html - HTML content of the page
   * @param _pageUrl - URL of the page being parsed (unused but kept for consistency)
   * @param listingType - Type of listing (sale, rent, commercial)
   * @returns Array of parsed listings
   */
  parseListings(html: string, _pageUrl: string, listingType: ListingType): MadlanListing[] {
    try {
      const $ = cheerio.load(html);
      const listings: MadlanListing[] = [];

      // TODO: Implement based on actual HTML structure after investigation
      // This is a placeholder structure - will be updated after site investigation
      
      // Try to find listing containers
      // Common selectors to try:
      // - div with class containing "listing", "property", "card"
      // - links to individual listing pages
      // - articles or sections containing listing data

      $('a[href*="/for-sale/"], a[href*="/for-rent/"], a[href*="/commercial/"]').each((_, element) => {
        try {
          const $link = $(element);
          const href = $link.attr('href');
          
          if (!href || href.includes('ישראל')) {
            return; // Skip main category links
          }

          const listingUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
          
          // Extract listing ID from URL
          const listingIdMatch = listingUrl.match(/\/(\d+)/);
          const listingId = listingIdMatch ? listingIdMatch[1] : listingUrl.split('/').pop() || '';

          if (!listingId) {
            return;
          }

          // Try to extract basic info from the listing card
          const title = $link.find('h2, h3, [class*="title"]').first().text().trim() || 
                       $link.text().trim().substring(0, 100);
          
          // Try to find price
          const priceText = $link.find('[class*="price"], [data-price]').first().text().trim() ||
                           $link.closest('[class*="listing"], [class*="card"]').find('[class*="price"]').first().text().trim();
          const price = this.parsePrice(priceText);

          // Try to find property details
          const detailsText = $link.find('[class*="details"], [class*="info"]').first().text().trim() ||
                            $link.closest('[class*="listing"], [class*="card"]').find('[class*="details"]').first().text().trim();
          const { rooms, areaSqm } = this.parsePropertyDetails(detailsText);

          // Try to find location
          const locationText = $link.find('[class*="location"], [class*="address"]').first().text().trim() ||
                              $link.closest('[class*="listing"], [class*="card"]').find('[class*="location"]').first().text().trim();
          const { city, neighborhood, address } = this.parseLocation(locationText);

          // Determine agent type (will be refined after investigation)
          const agentType = this.detectAgentType($link);

          const listing: MadlanListing = {
            listingId,
            title: title || 'Untitled Listing',
            price,
            rooms,
            areaSqm,
            city,
            neighborhood,
            address,
            agentType,
            listingType,
            listingUrl,
            features: [],
          };

          listings.push(listing);
        } catch (error) {
          this.logger.warn('Failed to parse listing from search results', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      this.logger.info('Parsed listings from search results', {
        count: listings.length,
        listingType,
      });

      return listings;
    } catch (error) {
      this.logger.error('Failed to parse listings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Parses a single listing detail page
   * @param html - HTML content of the listing page
   * @param listingUrl - URL of the listing page
   * @param listingType - Type of listing
   * @returns Parsed listing or null if parsing fails
   */
  parseListingDetail(html: string, listingUrl: string, listingType: ListingType): MadlanListing | null {
    try {
      const $ = cheerio.load(html);

      // Extract listing ID from URL
      const listingIdMatch = listingUrl.match(/\/(\d+)/);
      const listingId = listingIdMatch ? listingIdMatch[1] : listingUrl.split('/').pop() || '';

      if (!listingId) {
        this.logger.warn('Could not extract listing ID from URL', { listingUrl });
        return null;
      }

      // Extract title
      const title = $('h1').first().text().trim() ||
                    $('[class*="title"]').first().text().trim() ||
                    $('title').text().trim();

      // Extract price
      const priceText = $('[class*="price"], [id*="price"], [data-price]').first().text().trim();
      const price = this.parsePrice(priceText);

      // Extract property details
      const detailsSection = $('[class*="details"], [class*="specs"], [class*="info"]').first();
      const detailsText = detailsSection.text().trim();
      const { rooms, areaSqm, floor, propertyType } = this.parsePropertyDetails(detailsText);

      // Extract location
      const locationSection = $('[class*="location"], [class*="address"], [class*="area"]').first();
      const locationText = locationSection.text().trim();
      const { city, neighborhood, address } = this.parseLocation(locationText);

      // Extract description
      const description = $('[class*="description"], [class*="content"]').first().text().trim();

      // Extract features
      const features: string[] = [];
      $('[class*="feature"], [class*="amenity"]').each((_, el) => {
        const feature = $(el).text().trim();
        if (feature) {
          features.push(feature);
        }
      });

      // Extract agent information
      const agentSection = $('[class*="agent"], [class*="contact"], [class*="owner"]').first();
      const agentName = agentSection.find('[class*="name"]').first().text().trim() ||
                       agentSection.text().trim().split('\n')[0];
      const agentPhone = agentSection.find('[class*="phone"], a[href^="tel:"]').first().text().trim() ||
                       agentSection.find('a[href^="tel:"]').attr('href')?.replace('tel:', '') || null;

      // Determine agent type
      const agentType = this.detectAgentType(agentSection);

      // Extract dates
      const postedDate = $('[class*="posted"], [class*="date"]').first().text().trim() || null;
      const updatedDate = $('[class*="updated"]').first().text().trim() || null;

      // Extract image URLs
      const imageUrls: string[] = [];
      $('img[src*="madlan"], img[data-src*="madlan"]').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !imageUrls.includes(src)) {
          const fullUrl = src.startsWith('http') ? src : `${this.baseUrl}${src}`;
          imageUrls.push(fullUrl);
        }
      });

      const listing: MadlanListing = {
        listingId,
        title: title || 'Untitled Listing',
        price,
        propertyType,
        areaSqm,
        rooms,
        floor,
        address,
        city,
        neighborhood,
        description,
        features,
        agentType,
        agentName: agentName || null,
        agentPhone: agentPhone || null,
        listingType,
        listingUrl,
        postedDate,
        updatedDate,
        imageUrls,
      };

      return listing;
    } catch (error) {
      this.logger.error('Failed to parse listing detail', {
        error: error instanceof Error ? error.message : String(error),
        listingUrl,
      });
      return null;
    }
  }

  /**
   * Parses project listings from a projects page
   * @param html - HTML content of the page
   * @param _pageUrl - URL of the page being parsed (unused but kept for consistency)
   * @returns Array of parsed projects
   */
  parseProjects(html: string, _pageUrl: string): MadlanProject[] {
    try {
      const $ = cheerio.load(html);
      const projects: MadlanProject[] = [];

      // TODO: Implement based on actual HTML structure after investigation
      // This is a placeholder structure - will be updated after site investigation

      $('a[href*="/projects/"], a[href*="/project/"]').each((_, element) => {
        try {
          const $link = $(element);
          const href = $link.attr('href');
          
          if (!href) {
            return;
          }

          const projectUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
          
          // Extract project ID from URL
          const projectIdMatch = projectUrl.match(/\/(\d+)/);
          const projectId = projectIdMatch ? projectIdMatch[1] : projectUrl.split('/').pop() || '';

          if (!projectId) {
            return;
          }

          const projectName = $link.find('h2, h3, [class*="title"]').first().text().trim() ||
                             $link.text().trim().substring(0, 100);

          const project: MadlanProject = {
            projectId,
            projectName: projectName || 'Untitled Project',
            projectUrl,
          };

          projects.push(project);
        } catch (error) {
          this.logger.warn('Failed to parse project from search results', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      this.logger.info('Parsed projects from search results', {
        count: projects.length,
      });

      return projects;
    } catch (error) {
      this.logger.error('Failed to parse projects', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Parses a single project detail page
   * @param html - HTML content of the project page
   * @param projectUrl - URL of the project page
   * @returns Parsed project or null if parsing fails
   */
  parseProjectDetail(html: string, projectUrl: string): MadlanProject | null {
    try {
      const $ = cheerio.load(html);

      // Extract project ID from URL
      const projectIdMatch = projectUrl.match(/\/(\d+)/);
      const projectId = projectIdMatch ? projectIdMatch[1] : projectUrl.split('/').pop() || '';

      if (!projectId) {
        this.logger.warn('Could not extract project ID from URL', { projectUrl });
        return null;
      }

      // Extract project name
      const projectName = $('h1').first().text().trim() ||
                         $('[class*="title"]').first().text().trim() ||
                         $('title').text().trim();

      // Extract developer
      const developer = $('[class*="developer"], [class*="builder"]').first().text().trim() || undefined;

      // Extract address
      const address = $('[class*="address"], [class*="location"]').first().text().trim() || undefined;

      // Extract pricing
      const priceText = $('[class*="price"]').first().text().trim();
      const { priceFrom, priceTo, pricePerSqm } = this.parseProjectPricing(priceText);

      // Extract project details
      const detailsSection = $('[class*="details"], [class*="specs"]').first();
      const floors = this.extractNumber(detailsSection.find('[class*="floor"]').text());
      const units = this.extractNumber(detailsSection.find('[class*="unit"]').text());

      // Extract dates
      const completionDate = $('[class*="completion"], [class*="delivery"]').first().text().trim() || undefined;
      const constructionStart = $('[class*="start"]').first().text().trim() || undefined;
      const constructionEnd = $('[class*="end"]').first().text().trim() || undefined;

      // Extract delivery dates (array)
      const deliveryDates: string[] = [];
      $('[class*="delivery-date"]').each((_, el) => {
        const date = $(el).text().trim();
        if (date) {
          deliveryDates.push(date);
        }
      });

      // Extract description
      const description = $('[class*="description"], [class*="content"]').first().text().trim() || undefined;

      // Extract image URLs
      const imageUrls: string[] = [];
      $('img[src*="madlan"], img[data-src*="madlan"]').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !imageUrls.includes(src)) {
          const fullUrl = src.startsWith('http') ? src : `${this.baseUrl}${src}`;
          imageUrls.push(fullUrl);
        }
      });

      const project: MadlanProject = {
        projectId,
        projectName: projectName || 'Untitled Project',
        address,
        developer,
        floors,
        units,
        completionDate,
        priceFrom,
        priceTo,
        pricePerSqm,
        constructionStart,
        constructionEnd,
        deliveryDates,
        projectUrl,
        description,
        imageUrls,
      };

      return project;
    } catch (error) {
      this.logger.error('Failed to parse project detail', {
        error: error instanceof Error ? error.message : String(error),
        projectUrl,
      });
      return null;
    }
  }

  /**
   * Parses price from text
   * @param priceText - Text containing price
   * @returns Price as number or null
   */
  private parsePrice(priceText: string): number | null {
    if (!priceText) {
      return null;
    }

    // Remove currency symbols and spaces, extract numbers
    const cleaned = priceText.replace(/[₪,\s]/g, '');
    const match = cleaned.match(/(\d+)/);
    
    if (match) {
      return parseInt(match[1], 10);
    }

    return null;
  }

  /**
   * Parses property details (rooms, area, floor, type)
   * @param detailsText - Text containing property details
   * @returns Parsed details
   */
  private parsePropertyDetails(detailsText: string): {
    rooms: number | null;
    areaSqm: number | null;
    floor: string | null;
    propertyType: string | undefined;
  } {
    const result = {
      rooms: null as number | null,
      areaSqm: null as number | null,
      floor: null as string | null,
      propertyType: undefined as string | undefined,
    };

    if (!detailsText) {
      return result;
    }

    // Extract rooms (e.g., "3 חדרים", "3 rooms")
    const roomsMatch = detailsText.match(/(\d+)\s*(?:חדרים|rooms|room)/i);
    if (roomsMatch) {
      result.rooms = parseInt(roomsMatch[1], 10);
    }

    // Extract area (e.g., "80 מ\"ר", "80 sqm")
    const areaMatch = detailsText.match(/(\d+)\s*(?:מ\"ר|sqm|m²)/i);
    if (areaMatch) {
      result.areaSqm = parseInt(areaMatch[1], 10);
    }

    // Extract floor (e.g., "קומה 5", "floor 5", "קרקע", "מרתף")
    const floorMatch = detailsText.match(/(?:קומה|floor)\s*(\d+)|(קרקע|מרתף)/i);
    if (floorMatch) {
      result.floor = floorMatch[1] || floorMatch[2] || null;
    }

    // Extract property type (e.g., "דירה", "בית", "דופלקס")
    const propertyTypes = ['דירה', 'בית', 'דופלקס', 'פנטהאוז', 'וילה', 'דירת גן', 'קוטג\'', 'דופלקס', 'סטודיו'];
    for (const type of propertyTypes) {
      if (detailsText.includes(type)) {
        result.propertyType = type;
        break;
      }
    }

    return result;
  }

  /**
   * Parses location from text
   * @param locationText - Text containing location
   * @returns Parsed location
   */
  private parseLocation(locationText: string): {
    city: string | undefined;
    neighborhood: string | undefined;
    address: string | undefined;
  } {
    if (!locationText) {
      return { city: undefined, neighborhood: undefined, address: undefined };
    }

    // Try to extract city and neighborhood
    // Common format: "שכונה, עיר" or "עיר, שכונה"
    const parts = locationText.split(',').map(p => p.trim());
    
    if (parts.length >= 2) {
      return {
        city: parts[parts.length - 1],
        neighborhood: parts[0],
        address: locationText,
      };
    }

    return {
      city: locationText,
      neighborhood: undefined,
      address: locationText,
    };
  }

  /**
   * Parses project pricing
   * @param priceText - Text containing pricing information
   * @returns Parsed pricing
   */
  private parseProjectPricing(priceText: string): {
    priceFrom: number | null;
    priceTo: number | null;
    pricePerSqm: number | null;
  } {
    const result = {
      priceFrom: null as number | null,
      priceTo: null as number | null,
      pricePerSqm: null as number | null,
    };

    if (!priceText) {
      return result;
    }

    // Try to extract price range (e.g., "מ-2,000,000 עד 3,000,000")
    const rangeMatch = priceText.match(/מ-?(\d+(?:,\d+)*)\s*עד\s*(\d+(?:,\d+)*)/i);
    if (rangeMatch) {
      result.priceFrom = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
      result.priceTo = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
    } else {
      // Try single price
      const price = this.parsePrice(priceText);
      if (price) {
        result.priceFrom = price;
      }
    }

    // Try to extract price per sqm (e.g., "מ-15,000 ₪ למ\"ר")
    const sqmMatch = priceText.match(/(\d+(?:,\d+)*)\s*₪?\s*(?:למ\"ר|per sqm)/i);
    if (sqmMatch) {
      result.pricePerSqm = parseInt(sqmMatch[1].replace(/,/g, ''), 10);
    }

    return result;
  }

  /**
   * Extracts number from text
   * @param text - Text containing a number
   * @returns Number or null
   */
  private extractNumber(text: string): number | null {
    if (!text) {
      return null;
    }

    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Detects agent type from HTML element
   * @param $element - Cheerio element to analyze
   * @returns Agent type
   */
  private detectAgentType($element: cheerio.Cheerio<any>): AgentType {
    const text = $element.text().toLowerCase();
    const html = $element.html() || '';

    // Check for new construction indicators
    if (text.includes('בנייה חדשה') || text.includes('new construction') ||
        html.includes('new-construction') || html.includes('בנייה-חדשה')) {
      return AgentType.NEW_CONSTRUCTION;
    }

    // Check for agent indicators
    if (text.includes('סוכן') || text.includes('משרד תיווך') || text.includes('agent') ||
        html.includes('agent') || html.includes('סוכן')) {
      return AgentType.AGENT;
    }

    // Default to private
    return AgentType.PRIVATE;
  }
}

