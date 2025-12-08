import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../../../utils/logger';

/**
 * City mapping from important_cities.json format to Madlan docId
 * Format: { topArea, area, city } where city is the docId
 */
export interface CityMapping {
  topArea: string;
  area: string;
  city: string; // This is the docId for Madlan
}

/**
 * Utility class to load and manage city mappings for Madlan scraping
 */
export class MadlanCityMapper {
  private readonly logger: Logger;
  private cities: CityMapping[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Loads city mappings from important_cities.json file
   * Falls back to empty array if file doesn't exist
   */
  loadCitiesFromFile(filePath?: string): CityMapping[] {
    try {
      const citiesPath = filePath || path.join(
        process.cwd(),
        'real-estate-scraper-main',
        'data',
        'important_cities.json'
      );

      if (!fs.existsSync(citiesPath)) {
        this.logger.warn('Cities file not found, using empty list', { path: citiesPath });
        return [];
      }

      const fileContent = fs.readFileSync(citiesPath, 'utf-8');
      const cities = JSON.parse(fileContent) as CityMapping[];

      this.logger.info('Loaded city mappings', { count: cities.length });
      this.cities = cities;
      return cities;
    } catch (error) {
      this.logger.error('Failed to load city mappings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Gets all unique city docIds
   */
  getAllCityDocIds(): string[] {
    const docIds = new Set<string>();
    this.cities.forEach(city => {
      if (city.city) {
        docIds.add(city.city);
      }
    });
    return Array.from(docIds);
  }

  /**
   * Gets all city mappings
   */
  getAllCities(): CityMapping[] {
    return [...this.cities];
  }

  /**
   * Gets city docId by city code
   */
  getDocIdByCityCode(cityCode: string): string | undefined {
    const city = this.cities.find(c => c.city === cityCode);
    return city?.city;
  }
}

