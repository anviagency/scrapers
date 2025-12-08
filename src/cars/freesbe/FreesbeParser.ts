import * as cheerio from 'cheerio';
import type { Logger } from '../../utils/logger';
import type { FreesbeListing } from '../../types/FreesbeListing';
import type { Element } from 'domhandler';

/**
 * Parser for extracting aggregated car listing data from freesbe.com HTML
 * Only extracts data visible on listing cards, without accessing detail pages
 */
export class FreesbeParser {
  private readonly logger: Logger;
  private readonly baseUrl: string;

  /**
   * Creates a new FreesbeParser instance
   * @param logger - Logger instance
   * @param baseUrl - Base URL of the website
   */
  constructor(logger: Logger, baseUrl: string = 'https://freesbe.com') {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Parses car listings from HTML content (aggregated data only)
   * @param html - HTML content to parse
   * @param pageUrl - URL of the page being parsed
   * @returns Array of parsed car listings
   */
  parseListings(html: string, pageUrl: string): FreesbeListing[] {
    try {
      const $ = cheerio.load(html);
      const listings: FreesbeListing[] = [];

      // Based on browser analysis, listings appear as links with href="/used-car-for-sale/{make}/{model}/{year}-{carId}"
      // Each listing card contains aggregated information
      $('a[href*="/used-car-for-sale/"]').each((_index: number, element: Element) => {
        try {
          const $link = $(element);
          const href = $link.attr('href');
          if (!href || !href.includes('/used-car-for-sale/')) {
            return;
          }

          // Extract car ID from URL: /used-car-for-sale/{make}/{model}/{year}-c{carId}
          const urlMatch = href.match(/\/used-car-for-sale\/[^/]+\/[^/]+\/\d+-c(\d+)/);
          if (!urlMatch || !urlMatch[1]) {
            return;
          }
          const carId = urlMatch[1];

          // Check if we already parsed this listing
          if (listings.some(l => l.carId === carId)) {
            return;
          }

          const listing = this.parseListingCard($, $link, pageUrl, carId, href);
          if (listing) {
            listings.push(listing);
          }
        } catch (error) {
          this.logger.warn('Failed to parse listing', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      this.logger.debug(`Parsed ${listings.length} listings from page`, { pageUrl });
      return listings;
    } catch (error) {
      this.logger.error('Failed to parse listings', {
        error: error instanceof Error ? error.message : String(error),
        pageUrl,
      });
      return [];
    }
  }

  /**
   * Parses a single listing card (aggregated data only)
   * @param $ - Cheerio instance
   * @param $link - Cheerio element for the listing link
   * @param pageUrl - URL of the page
   * @param carId - Car ID extracted from URL
   * @param href - Full href from link
   * @returns Parsed listing or null
   */
  private parseListingCard(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<Element>,
    _pageUrl: string,
    carId: string,
    href: string
  ): FreesbeListing | null {
    try {
      // Find the container - could be parent or nearby elements
      const $container = $link.closest('article, div[class*="card"], div[class*="listing"], li, div[class*="item"], [role="region"]');
      
      // Extract make and model from URL: /used-car-for-sale/{make}/{model}/{year}-c{carId}
      const urlParts = href.split('/');
      const make = urlParts[urlParts.length - 3] || '';
      const model = urlParts[urlParts.length - 2] || '';

      // Extract year from URL or text
      const yearMatch = href.match(/\/(\d{4})-c\d+/);
      let year: number | null = null;
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }

      // Extract version from heading
      const titleText = $container.find('h3, h4, h2, [class*="title"], [class*="model"]').first().text().trim();
      const versionMatch = titleText.match(/(PREMIUM|GT|ELITE|LUXURY|ACTIVE|TECH|PACK|ALLURE|EXPRESSION|LAUREATE|STYLE|INTENSE|ACENTA|TEKNA|NET UP|NOBLE|TITANIUM|MAXI|SHINE|COMFORT|PRIME|PRIME PLUS|CROSSTREK|PANORAMIC|DESIGN|LIMO|PHEV|RWD|4XE|130HP|SV|LX)/i);
      const version = versionMatch ? versionMatch[0] : null;

      // Extract price
      const priceText = $container.find('[class*="price"], h3[class*="price"]').first().text().trim();
      const price = this.parsePrice(priceText);

      // Extract monthly payment
      const monthlyPaymentText = $container.text().match(/₪(\d{1,3}(?:,\d{3})*)\s*לחודש/);
      const monthlyPayment = monthlyPaymentText ? parseInt(monthlyPaymentText[1].replace(/,/g, ''), 10) : null;

      // Extract mileage
      const mileageText = $container.text().match(/(\d{1,3}(?:,\d{3})*)\s*ק״מ/);
      const mileage = mileageText ? parseInt(mileageText[1].replace(/,/g, ''), 10) : null;

      // Extract hand (יד)
      const handMatch = $container.text().match(/יד\s+(\d+)/);
      const hand = handMatch ? parseInt(handMatch[1], 10) : null;

      // Extract transmission
      const transmission = this.extractTransmission($container.text());

      // Extract fuel type
      const fuelType = this.extractFuelType($container.text());

      // Extract location
      const locationText = $container.find('[class*="location"], [class*="מיקום"]').text().trim() ||
        $container.text().match(/([א-ת\s]+)\s+(?:₪|\d{4})/)?.[1]?.trim();
      const location = locationText || '';
      const city = location.split(',')[0]?.trim() || location;

      // Extract images
      const images: string[] = [];
      $container.find('img[src*="car"], img[alt*="רכב"], [class*="gallery"] img').each((_, img) => {
        const src = $(img).attr('src');
        if (src && !src.includes('placeholder') && !src.includes('icon')) {
          const imageUrl = src.startsWith('http') ? src : `${this.baseUrl}${src}`;
          images.push(imageUrl);
        }
      });

      // Collect all aggregated data into a JSON object
      const aggregatedData: Record<string, unknown> = {
        title: titleText,
        rawText: $container.text().trim(),
        hasImages: images.length > 0,
        imageCount: images.length,
      };

      // Extract any additional visible features/tags
      const features: string[] = [];
      $container.find('[class*="tag"], [class*="badge"], [class*="feature"]').each((_, el) => {
        const featureText = $(el).text().trim();
        if (featureText && featureText.length > 2) {
          features.push(featureText);
        }
      });
      if (features.length > 0) {
        aggregatedData.features = features;
      }

      // Construct listing URL
      const listingUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

      const listing: FreesbeListing = {
        carId,
        make: make || 'Unknown',
        model: model || 'Unknown',
        year,
        version: version || null,
        price,
        monthlyPayment,
        mileage,
        hand,
        transmission,
        fuelType,
        location,
        city,
        aggregatedData,
        images: images.length > 0 ? images : undefined,
        listingUrl,
        postedDate: null,
      };

      return listing;
    } catch (error) {
      this.logger.error('Failed to parse listing card', {
        carId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Parses price from text
   */
  private parsePrice(text: string): number | null {
    if (!text) return null;
    // Remove currency symbol and parse
    const cleanText = text.replace(/[₪,]/g, '').trim();
    const match = cleanText.match(/(\d{1,3}(?:\d{3})*)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Extracts fuel type from text
   */
  private extractFuelType(text: string): string | null {
    const fuelTypes = ['בנזין', 'דיזל', 'היברידי', 'חשמלי', 'PHEV', 'hybrid', 'electric'];
    for (const fuelType of fuelTypes) {
      if (text.includes(fuelType)) {
        return fuelType;
      }
    }
    return null;
  }

  /**
   * Extracts transmission type from text
   */
  private extractTransmission(text: string): string | null {
    if (text.includes('אוטומטי') || text.includes('automatic')) {
      return 'אוטומטי';
    }
    if (text.includes('ידני') || text.includes('manual')) {
      return 'ידני';
    }
    return null;
  }
}

