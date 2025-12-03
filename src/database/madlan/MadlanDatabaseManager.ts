import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from '../../utils/logger';
import type { MadlanListing } from '../../types/MadlanListing';
import type { MadlanProject } from '../../types/MadlanProject';
import type { MadlanImage } from '../../types/MadlanImage';
import { AgentType, ListingType } from '../../types/MadlanListing';
import { ImageType } from '../../types/MadlanImage';

/**
 * Database manager for Madlan real estate scraper
 * Handles listings, projects, and images
 */
export class MadlanDatabaseManager {
  protected db: Database.Database;
  protected readonly logger: Logger;

  /**
   * Creates a new MadlanDatabaseManager instance
   * @param dbPath - Path to SQLite database file
   * @param logger - Logger instance
   */
  constructor(dbPath: string, logger: Logger) {
    this.logger = logger;

    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initializeSchema();
  }

  /**
   * Initializes database schema
   */
  protected initializeSchema(): void {
    try {
      // Try to find schema.sql in multiple locations
      let schemaPath = path.join(__dirname, '..', 'schema.sql');
      
      // If running from dist, schema.sql might be in src
      if (!fs.existsSync(schemaPath)) {
        const srcPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
        if (fs.existsSync(srcPath)) {
          schemaPath = srcPath;
        } else {
          // Try relative to current working directory
          const cwdPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
          if (fs.existsSync(cwdPath)) {
            schemaPath = cwdPath;
          }
        }
      }

      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
        this.logger.info('Database schema initialized from file', { schemaPath });
      } else {
        this.logger.warn('Schema file not found, schema should be created manually');
      }
    } catch (error) {
      this.logger.error('Failed to initialize database schema', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Upserts listings into the database
   * @param listings - Array of listings to upsert
   * @returns Number of listings inserted/updated
   */
  upsertListings(listings: MadlanListing[]): number {
    if (listings.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO listings_madlan (
        listing_id, title, price, property_type, area_sqm, rooms, floor,
        address, city, neighborhood, description, features, agent_type,
        agent_name, agent_phone, listing_type, listing_url, posted_date, updated_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((listings: MadlanListing[]) => {
      let count = 0;
      for (const listing of listings) {
        try {
          stmt.run(
            listing.listingId,
            listing.title,
            listing.price ?? null,
            listing.propertyType ?? null,
            listing.areaSqm ?? null,
            listing.rooms ?? null,
            listing.floor ?? null,
            listing.address ?? null,
            listing.city ?? null,
            listing.neighborhood ?? null,
            listing.description ?? null,
            listing.features ? JSON.stringify(listing.features) : null,
            listing.agentType,
            listing.agentName ?? null,
            listing.agentPhone ?? null,
            listing.listingType,
            listing.listingUrl,
            listing.postedDate ?? null,
            listing.updatedDate ?? null
          );
          count++;
        } catch (error) {
          this.logger.error('Failed to upsert listing', {
            listingId: listing.listingId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return count;
    });

    try {
      const count = insertMany(listings);
      this.logger.debug(`Upserted ${count} listings`, { total: listings.length });
      return count;
    } catch (error) {
      this.logger.error('Failed to upsert listings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Upserts projects into the database
   * @param projects - Array of projects to upsert
   * @returns Number of projects inserted/updated
   */
  upsertProjects(projects: MadlanProject[]): number {
    if (projects.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO projects_madlan (
        project_id, project_name, address, developer, floors, units,
        completion_date, price_from, price_to, price_per_sqm,
        construction_start, construction_end, delivery_dates,
        project_url, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((projects: MadlanProject[]) => {
      let count = 0;
      for (const project of projects) {
        try {
          stmt.run(
            project.projectId,
            project.projectName,
            project.address ?? null,
            project.developer ?? null,
            project.floors ?? null,
            project.units ?? null,
            project.completionDate ?? null,
            project.priceFrom ?? null,
            project.priceTo ?? null,
            project.pricePerSqm ?? null,
            project.constructionStart ?? null,
            project.constructionEnd ?? null,
            project.deliveryDates ? JSON.stringify(project.deliveryDates) : null,
            project.projectUrl,
            project.description ?? null
          );
          count++;
        } catch (error) {
          this.logger.error('Failed to upsert project', {
            projectId: project.projectId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return count;
    });

    try {
      const count = insertMany(projects);
      this.logger.debug(`Upserted ${count} projects`, { total: projects.length });
      return count;
    } catch (error) {
      this.logger.error('Failed to upsert projects', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Saves image metadata to the database
   * @param images - Array of images to save
   * @returns Number of images saved
   */
  saveImageMetadata(images: MadlanImage[]): number {
    if (images.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO images_madlan (
        image_id, listing_id, project_id, image_url, local_path,
        image_type, order_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((images: MadlanImage[]) => {
      let count = 0;
      for (const image of images) {
        try {
          stmt.run(
            image.imageId,
            image.listingId ?? null,
            image.projectId ?? null,
            image.imageUrl,
            image.localPath ?? null,
            image.imageType,
            image.orderIndex ?? null
          );
          count++;
        } catch (error) {
          this.logger.error('Failed to save image metadata', {
            imageId: image.imageId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return count;
    });

    try {
      const count = insertMany(images);
      this.logger.debug(`Saved ${count} image metadata records`, { total: images.length });
      return count;
    } catch (error) {
      this.logger.error('Failed to save image metadata', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets images for a listing
   * @param listingId - Listing ID
   * @returns Array of image metadata
   */
  getImagesForListing(listingId: string): MadlanImage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM images_madlan
      WHERE listing_id = ?
      ORDER BY order_index ASC
    `);

    const rows = stmt.all(listingId) as any[];
    return rows.map(row => ({
      imageId: row.image_id,
      listingId: row.listing_id,
      projectId: row.project_id,
      imageUrl: row.image_url,
      localPath: row.local_path,
      imageType: row.image_type as ImageType,
      orderIndex: row.order_index,
    }));
  }

  /**
   * Gets images for a project
   * @param projectId - Project ID
   * @returns Array of image metadata
   */
  getImagesForProject(projectId: string): MadlanImage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM images_madlan
      WHERE project_id = ?
      ORDER BY order_index ASC
    `);

    const rows = stmt.all(projectId) as any[];
    return rows.map(row => ({
      imageId: row.image_id,
      listingId: row.listing_id,
      projectId: row.project_id,
      imageUrl: row.image_url,
      localPath: row.local_path,
      imageType: row.image_type as ImageType,
      orderIndex: row.order_index,
    }));
  }

  /**
   * Creates a new scraping session
   * @returns Session ID
   */
  createScrapingSession(): number {
    const stmt = this.db.prepare(`
      INSERT INTO scraping_sessions_madlan (started_at, status)
      VALUES (CURRENT_TIMESTAMP, 'running')
    `);
    const result = stmt.run();
    return Number(result.lastInsertRowid);
  }

  /**
   * Updates a scraping session
   * @param sessionId - Session ID
   * @param updates - Session updates
   */
  updateScrapingSession(
    sessionId: number,
    updates: {
      pagesScraped?: number;
      listingsFound?: number;
      projectsFound?: number;
      imagesFound?: number;
      status?: 'running' | 'completed' | 'failed';
      errorMessage?: string;
    }
  ): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.pagesScraped !== undefined) {
      fields.push('pages_scraped = ?');
      values.push(updates.pagesScraped);
    }
    if (updates.listingsFound !== undefined) {
      fields.push('listings_found = ?');
      values.push(updates.listingsFound);
    }
    if (updates.projectsFound !== undefined) {
      fields.push('projects_found = ?');
      values.push(updates.projectsFound);
    }
    if (updates.imagesFound !== undefined) {
      fields.push('images_found = ?');
      values.push(updates.imagesFound);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'completed' || updates.status === 'failed') {
        fields.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.errorMessage);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(sessionId);
    const sql = `UPDATE scraping_sessions_madlan SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Gets listings with optional filters
   * @param filters - Optional filters
   * @returns Array of listings
   */
  getListings(filters?: {
    listingType?: 'sale' | 'rent' | 'commercial';
    city?: string;
    agentType?: 'private' | 'agent' | 'new_construction';
    limit?: number;
    offset?: number;
  }): MadlanListing[] {
    let sql = 'SELECT * FROM listings_madlan WHERE 1=1';
    const params: any[] = [];

    if (filters?.listingType) {
      sql += ' AND listing_type = ?';
      params.push(filters.listingType);
    }
    if (filters?.city) {
      sql += ' AND city = ?';
      params.push(filters.city);
    }
    if (filters?.agentType) {
      sql += ' AND agent_type = ?';
      params.push(filters.agentType);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      listingId: String(row.listing_id),
      title: String(row.title),
      price: row.price ? Number(row.price) : null,
      propertyType: row.property_type ? String(row.property_type) : undefined,
      areaSqm: row.area_sqm ? Number(row.area_sqm) : null,
      rooms: row.rooms ? Number(row.rooms) : null,
      floor: row.floor ? String(row.floor) : null,
      address: row.address ? String(row.address) : undefined,
      city: row.city ? String(row.city) : undefined,
      neighborhood: row.neighborhood ? String(row.neighborhood) : undefined,
      description: row.description ? String(row.description) : undefined,
      features: row.features ? JSON.parse(row.features) : [],
      agentType: row.agent_type as AgentType,
      agentName: row.agent_name ? String(row.agent_name) : null,
      agentPhone: row.agent_phone ? String(row.agent_phone) : null,
      listingType: row.listing_type as ListingType,
      listingUrl: String(row.listing_url),
      postedDate: row.posted_date ? String(row.posted_date) : null,
      updatedDate: row.updated_date ? String(row.updated_date) : null,
      imageUrls: [] as string[],
    }));
  }

  /**
   * Gets projects with optional filters
   * @param filters - Optional filters
   * @returns Array of projects
   */
  getProjects(filters?: {
    developer?: string;
    limit?: number;
    offset?: number;
  }): MadlanProject[] {
    let sql = 'SELECT * FROM projects_madlan WHERE 1=1';
    const params: any[] = [];

    if (filters?.developer) {
      sql += ' AND developer = ?';
      params.push(filters.developer);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      projectId: row.project_id,
      projectName: row.project_name,
      address: row.address,
      developer: row.developer,
      floors: row.floors,
      units: row.units,
      completionDate: row.completion_date,
      priceFrom: row.price_from,
      priceTo: row.price_to,
      pricePerSqm: row.price_per_sqm,
      constructionStart: row.construction_start,
      constructionEnd: row.construction_end,
      deliveryDates: row.delivery_dates ? JSON.parse(row.delivery_dates) : [],
      projectUrl: row.project_url,
      description: row.description,
      imageUrls: [], // Will be populated separately if needed
    }));
  }

  /**
   * Gets a listing by ID
   * @param listingId - Listing ID
   * @returns Listing or null if not found
   */
  getListingById(listingId: string): MadlanListing | null {
    const stmt = this.db.prepare('SELECT * FROM listings_madlan WHERE listing_id = ?');
    const row = stmt.get(listingId) as any;

    if (!row) {
      return null;
    }

    return {
      listingId: String(row.listing_id),
      title: String(row.title),
      price: row.price ? Number(row.price) : null,
      propertyType: row.property_type ? String(row.property_type) : undefined,
      areaSqm: row.area_sqm ? Number(row.area_sqm) : null,
      rooms: row.rooms ? Number(row.rooms) : null,
      floor: row.floor ? String(row.floor) : null,
      address: row.address ? String(row.address) : undefined,
      city: row.city ? String(row.city) : undefined,
      neighborhood: row.neighborhood ? String(row.neighborhood) : undefined,
      description: row.description ? String(row.description) : undefined,
      features: row.features ? JSON.parse(row.features) : [],
      agentType: row.agent_type as AgentType,
      agentName: row.agent_name ? String(row.agent_name) : null,
      agentPhone: row.agent_phone ? String(row.agent_phone) : null,
      listingType: row.listing_type as ListingType,
      listingUrl: String(row.listing_url),
      postedDate: row.posted_date ? String(row.posted_date) : null,
      updatedDate: row.updated_date ? String(row.updated_date) : null,
      imageUrls: [] as string[],
    };
  }

  /**
   * Gets a project by ID
   * @param projectId - Project ID
   * @returns Project or null if not found
   */
  getProjectById(projectId: string): MadlanProject | null {
    const stmt = this.db.prepare('SELECT * FROM projects_madlan WHERE project_id = ?');
    const row = stmt.get(projectId) as any;

    if (!row) {
      return null;
    }

    return {
      projectId: row.project_id,
      projectName: row.project_name,
      address: row.address,
      developer: row.developer,
      floors: row.floors,
      units: row.units,
      completionDate: row.completion_date,
      priceFrom: row.price_from,
      priceTo: row.price_to,
      pricePerSqm: row.price_per_sqm,
      constructionStart: row.construction_start,
      constructionEnd: row.construction_end,
      deliveryDates: row.delivery_dates ? JSON.parse(row.delivery_dates) : [],
      projectUrl: row.project_url,
      description: row.description,
      imageUrls: [],
    };
  }

  /**
   * Closes the database connection
   */
  close(): void {
    this.db.close();
  }
}

