import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from '../../utils/logger';
import type { CarWizListing } from '../../types/CarWizListing';

/**
 * Database manager for CarWiz car scraper
 * Handles car listings from carwiz.co.il via GraphQL API
 */
export class CarWizDatabaseManager {
  protected db: Database.Database;
  protected readonly logger: Logger;

  constructor(dbPath: string, logger: Logger) {
    this.logger = logger;

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  protected initializeSchema(): void {
    try {
      // Create CarWiz tables directly (don't rely on schema.sql)
      this.createCarWizTables();
      this.logger.info('CarWiz database schema initialized');
    } catch (error) {
      this.logger.error('Failed to initialize database schema', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private createCarWizTables(): void {
    // Create listings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS listings_carwiz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        car_id TEXT NOT NULL UNIQUE,
        is_truck INTEGER DEFAULT 0,
        details_view_count INTEGER,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        plate TEXT,
        year INTEGER,
        price REAL,
        previous_price REAL,
        price_discount INTEGER DEFAULT 0,
        price_difference REAL DEFAULT 0,
        kilometrage INTEGER,
        hand INTEGER,
        original_owner_id INTEGER,
        original_owner_name TEXT,
        future_tradein INTEGER DEFAULT 0,
        parallel_import INTEGER DEFAULT 0,
        color_name TEXT,
        color_name_v2 TEXT,
        warranty TEXT,
        warranty_months INTEGER,
        commitment_to_check TEXT,
        license_validity DATETIME,
        license_cost REAL,
        down_payment REAL,
        monthly_payment REAL,
        specification_json TEXT,
        make_name TEXT,
        model_name TEXT,
        finish_level TEXT,
        engine_displacement INTEGER,
        gear TEXT,
        fuel_type TEXT,
        category TEXT,
        segment TEXT,
        doors_count INTEGER,
        seats_count INTEGER,
        agency_branch_json TEXT,
        agency_id INTEGER,
        agency_name TEXT,
        agency_display_name TEXT,
        agency_logo TEXT,
        city TEXT,
        address TEXT,
        area_name TEXT,
        district TEXT,
        longitude REAL,
        latitude REAL,
        phone TEXT,
        virtual_phone TEXT,
        insights_json TEXT,
        images_json TEXT,
        jato_images_json TEXT,
        image_urls TEXT,
        jato_image_urls TEXT,
        is_allowed_trading INTEGER DEFAULT 1,
        listing_url TEXT,
        db_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        db_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scraping_sessions_carwiz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        pages_scraped INTEGER DEFAULT 0,
        listings_found INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
        error_message TEXT
      )
    `);

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_car_id ON listings_carwiz(car_id)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_make_name ON listings_carwiz(make_name)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_model_name ON listings_carwiz(model_name)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_year ON listings_carwiz(year)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_price ON listings_carwiz(price)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_city ON listings_carwiz(city)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_agency_id ON listings_carwiz(agency_id)',
      'CREATE INDEX IF NOT EXISTS idx_listings_carwiz_created_at ON listings_carwiz(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_carwiz_status ON scraping_sessions_carwiz(status)',
    ];

    for (const indexSql of indexes) {
      try {
        this.db.exec(indexSql);
      } catch {
        // Ignore index creation errors
      }
    }
  }

  upsertListings(listings: CarWizListing[]): number {
    if (listings.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO listings_carwiz (
        car_id, is_truck, details_view_count,
        created_at, updated_at,
        plate, year, price, previous_price,
        price_discount, price_difference, kilometrage, hand,
        original_owner_id, original_owner_name,
        future_tradein, parallel_import,
        color_name, color_name_v2,
        warranty, warranty_months, commitment_to_check,
        license_validity, license_cost,
        down_payment, monthly_payment,
        specification_json, make_name, model_name, finish_level,
        engine_displacement, gear, fuel_type, category, segment,
        doors_count, seats_count,
        agency_branch_json, agency_id, agency_name, agency_display_name,
        agency_logo, city, address, area_name, district,
        longitude, latitude, phone, virtual_phone,
        insights_json, images_json, jato_images_json,
        image_urls, jato_image_urls,
        is_allowed_trading, listing_url,
        db_updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const insertMany = this.db.transaction((listings: CarWizListing[]) => {
      let count = 0;
      for (const listing of listings) {
        try {
          const makeName = listing.specification?.makeName || null;
          const modelName = listing.specification?.modelName || null;
          const city = listing.agencyBranch?.city || null;
          const agencyId = listing.agencyBranch?.agencyId || null;
          const agencyName = listing.agencyBranch?.agency?.name || null;
          const agencyDisplayName = listing.agencyBranch?.agency?.displayName || null;
          const agencyLogo = listing.agencyBranch?.agency?.logo || null;

          stmt.run(
            listing.carId,
            listing.isTruck ? 1 : 0,
            listing.detailsViewCount ?? null,
            listing.createdAt,
            listing.updatedAt,
            listing.plate ?? null,
            listing.year ?? null,
            listing.price ?? null,
            listing.previousPrice ?? null,
            listing.priceDiscount ? 1 : 0,
            listing.priceDifference ?? null,
            listing.kilometrage ?? null,
            listing.hand ?? null,
            listing.originalOwnerId ?? null,
            listing.originalOwnerName ?? null,
            listing.futureTradein ? 1 : 0,
            listing.parallelImport ? 1 : 0,
            listing.colorName ?? null,
            listing.colorNameV2 ?? null,
            listing.warranty ?? null,
            listing.warrantyMonths ?? null,
            listing.commitmentToCheck ?? null,
            listing.licenseValidity ?? null,
            listing.licenseCost ?? null,
            listing.downPayment ?? null,
            listing.monthlyPayment ?? null,
            listing.specification ? JSON.stringify(listing.specification) : null,
            makeName,
            modelName,
            listing.specification?.finishLevel ?? null,
            listing.specification?.engineDisplacement ?? null,
            listing.specification?.gear ?? null,
            listing.specification?.fuelType ?? null,
            listing.specification?.category ?? null,
            listing.specification?.segment ?? null,
            listing.specification?.doorsCount ?? null,
            listing.specification?.seatsCount ?? null,
            listing.agencyBranch ? JSON.stringify(listing.agencyBranch) : null,
            agencyId,
            agencyName,
            agencyDisplayName,
            agencyLogo,
            city,
            listing.agencyBranch?.address ?? null,
            listing.agencyBranch?.areaName ?? null,
            listing.agencyBranch?.district ?? null,
            listing.agencyBranch?.longitude ?? null,
            listing.agencyBranch?.latitude ?? null,
            listing.agencyBranch?.phone ?? null,
            listing.agencyBranch?.virtualPhone ?? null,
            listing.insights ? JSON.stringify(listing.insights) : null,
            listing.images ? JSON.stringify(listing.images) : null,
            listing.jatoImages ? JSON.stringify(listing.jatoImages) : null,
            listing.imageUrls ? JSON.stringify(listing.imageUrls) : null,
            listing.jatoImageUrls ? JSON.stringify(listing.jatoImageUrls) : null,
            listing.isAllowedTrading ? 1 : 0,
            listing.listingUrl ?? null,
            new Date().toISOString()
          );
          count++;
        } catch (error) {
          this.logger.error('Failed to upsert listing', {
            carId: listing.carId,
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

  getListingById(carId: string): CarWizListing | null {
    const stmt = this.db.prepare('SELECT * FROM listings_carwiz WHERE car_id = ?');
    const row = stmt.get(carId) as any;
    if (!row) {
      return null;
    }
    return this.mapRowToListing(row);
  }

  private mapRowToListing(row: any): CarWizListing {
    return {
      carId: row.car_id,
      isTruck: row.is_truck === 1,
      detailsViewCount: row.details_view_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      plate: row.plate,
      year: row.year,
      price: row.price,
      previousPrice: row.previous_price,
      priceDiscount: row.price_discount === 1,
      priceDifference: row.price_difference,
      kilometrage: row.kilometrage,
      hand: row.hand,
      originalOwnerId: row.original_owner_id,
      originalOwnerName: row.original_owner_name,
      futureTradein: row.future_tradein === 1,
      parallelImport: row.parallel_import === 1,
      colorName: row.color_name,
      colorNameV2: row.color_name_v2,
      warranty: row.warranty,
      warrantyMonths: row.warranty_months,
      commitmentToCheck: row.commitment_to_check,
      licenseValidity: row.license_validity,
      licenseCost: row.license_cost,
      downPayment: row.down_payment,
      monthlyPayment: row.monthly_payment,
      specification: row.specification_json ? JSON.parse(row.specification_json) : null,
      agencyBranch: row.agency_branch_json ? JSON.parse(row.agency_branch_json) : null,
      insights: row.insights_json ? JSON.parse(row.insights_json) : null,
      images: row.images_json ? JSON.parse(row.images_json) : null,
      jatoImages: row.jato_images_json ? JSON.parse(row.jato_images_json) : null,
      imageUrls: row.image_urls ? JSON.parse(row.image_urls) : [],
      jatoImageUrls: row.jato_image_urls ? JSON.parse(row.jato_image_urls) : [],
      isAllowedTrading: row.is_allowed_trading === 1,
      listingUrl: row.listing_url,
    };
  }

  createScrapingSession(): number {
    const stmt = this.db.prepare(`
      INSERT INTO scraping_sessions_carwiz (started_at, status)
      VALUES (CURRENT_TIMESTAMP, 'running')
    `);
    const result = stmt.run();
    return Number(result.lastInsertRowid);
  }

  updateScrapingSession(
    sessionId: number,
    updates: {
      pagesScraped?: number;
      listingsFound?: number;
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
    const sql = `UPDATE scraping_sessions_carwiz SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  getListingsCount(): number {
    const sql = 'SELECT COUNT(*) as count FROM listings_carwiz';
    const stmt = this.db.prepare(sql);
    const result = stmt.get() as { count: number };
    return result?.count || 0;
  }

  getListings(filters?: {
    make?: string;
    model?: string;
    year?: number;
    minPrice?: number;
    maxPrice?: number;
    city?: string;
    limit?: number;
    offset?: number;
  }): CarWizListing[] {
    let sql = 'SELECT * FROM listings_carwiz WHERE 1=1';
    const values: any[] = [];

    if (filters?.make) {
      sql += ' AND make_name = ?';
      values.push(filters.make);
    }
    if (filters?.model) {
      sql += ' AND model_name = ?';
      values.push(filters.model);
    }
    if (filters?.year) {
      sql += ' AND year = ?';
      values.push(filters.year);
    }
    if (filters?.minPrice !== undefined) {
      sql += ' AND price >= ?';
      values.push(filters.minPrice);
    }
    if (filters?.maxPrice !== undefined) {
      sql += ' AND price <= ?';
      values.push(filters.maxPrice);
    }
    if (filters?.city) {
      sql += ' AND city LIKE ?';
      values.push(`%${filters.city}%`);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      values.push(filters.limit);
      if (filters?.offset) {
        sql += ' OFFSET ?';
        values.push(filters.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...values) as any[];

    return rows.map(row => this.mapRowToListing(row));
  }

  getLatestSession(): {
    id: number;
    startedAt: string;
    completedAt: string | null;
    pagesScraped: number;
    listingsFound: number;
    status: string;
    errorMessage: string | null;
  } | null {
    const stmt = this.db.prepare(`
      SELECT * FROM scraping_sessions_carwiz
      ORDER BY started_at DESC
      LIMIT 1
    `);
    const row = stmt.get() as any;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      pagesScraped: row.pages_scraped,
      listingsFound: row.listings_found,
      status: row.status,
      errorMessage: row.error_message,
    };
  }

  getLastScrapingSession() {
    return this.getLatestSession();
  }

  getScrapingSessions(limit: number = 10): Array<{
    id: number;
    startedAt: string;
    completedAt: string | null;
    pagesScraped: number;
    listingsFound: number;
    status: string;
    errorMessage: string | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT * FROM scraping_sessions_carwiz
      ORDER BY started_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      pagesScraped: row.pages_scraped,
      listingsFound: row.listings_found,
      status: row.status,
      errorMessage: row.error_message,
    }));
  }

  close(): void {
    this.db.close();
  }
}
