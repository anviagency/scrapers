import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from '../../utils/logger';
import type { FreesbeListing } from '../../types/FreesbeListing';

/**
 * Database manager for Freesbe car scraper
 * Handles aggregated car listing data from freesbe.com
 */
export class FreesbeDatabaseManager {
  protected db: Database.Database;
  protected readonly logger: Logger;

  /**
   * Creates a new FreesbeDatabaseManager instance
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
        try {
          const schema = fs.readFileSync(schemaPath, 'utf-8');
          this.db.exec(schema);
          this.logger.info('Database schema initialized from file', { schemaPath });
        } catch (schemaError) {
          this.logger.warn('Schema file failed, creating Freesbe tables directly', {
            error: schemaError instanceof Error ? schemaError.message : String(schemaError),
          });
          this.createFreesbeTablesOnly();
        }
      } else {
        this.logger.warn('Schema file not found, creating Freesbe tables directly');
        this.createFreesbeTablesOnly();
      }
    } catch (error) {
      this.logger.error('Failed to initialize database schema', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private createFreesbeTablesOnly(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS listings_freesbe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        car_id TEXT NOT NULL UNIQUE,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER,
        version TEXT,
        price REAL,
        monthly_payment REAL,
        mileage INTEGER,
        hand INTEGER,
        transmission TEXT,
        fuel_type TEXT,
        location TEXT,
        city TEXT,
        aggregated_data TEXT,
        images TEXT,
        listing_url TEXT NOT NULL,
        posted_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scraping_sessions_freesbe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        pages_scraped INTEGER DEFAULT 0,
        listings_found INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
        error_message TEXT
      )
    `);

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_listings_freesbe_car_id ON listings_freesbe(car_id)',
      'CREATE INDEX IF NOT EXISTS idx_listings_freesbe_make ON listings_freesbe(make)',
      'CREATE INDEX IF NOT EXISTS idx_listings_freesbe_model ON listings_freesbe(model)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_freesbe_status ON scraping_sessions_freesbe(status)',
    ];

    for (const indexSql of indexes) {
      try {
        this.db.exec(indexSql);
      } catch {
        // Ignore index creation errors
      }
    }

    this.logger.info('Freesbe tables created directly');
  }

  /**
   * Upserts listings into the database
   * @param listings - Array of listings to upsert
   * @returns Number of listings inserted/updated
   */
  upsertListings(listings: FreesbeListing[]): number {
    if (listings.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO listings_freesbe (
        car_id, make, model, year, version, price, monthly_payment,
        mileage, hand, transmission, fuel_type, location, city,
        aggregated_data, images, listing_url, posted_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((listings: FreesbeListing[]) => {
      let count = 0;
      for (const listing of listings) {
        try {
          stmt.run(
            listing.carId,
            listing.make,
            listing.model,
            listing.year ?? null,
            listing.version ?? null,
            listing.price ?? null,
            listing.monthlyPayment ?? null,
            listing.mileage ?? null,
            listing.hand ?? null,
            listing.transmission ?? null,
            listing.fuelType ?? null,
            listing.location ?? null,
            listing.city ?? null,
            listing.aggregatedData ? JSON.stringify(listing.aggregatedData) : null,
            listing.images ? JSON.stringify(listing.images) : null,
            listing.listingUrl,
            listing.postedDate ?? null
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

  /**
   * Creates a new scraping session
   * @returns Session ID
   */
  createScrapingSession(): number {
    const stmt = this.db.prepare(`
      INSERT INTO scraping_sessions_freesbe (started_at, status)
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
    const sql = `UPDATE scraping_sessions_freesbe SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Gets count of listings in database
   * @returns Total number of listings
   */
  getListingsCount(): number {
    const sql = 'SELECT COUNT(*) as count FROM listings_freesbe';
    const stmt = this.db.prepare(sql);
    const result = stmt.get() as { count: number };
    return result?.count || 0;
  }

  /**
   * Gets listings with optional filters
   * @param filters - Optional filters
   * @returns Array of listings
   */
  getListings(filters?: {
    make?: string;
    model?: string;
    year?: number;
    minPrice?: number;
    maxPrice?: number;
    location?: string;
    limit?: number;
    offset?: number;
  }): FreesbeListing[] {
    let sql = 'SELECT * FROM listings_freesbe WHERE 1=1';
    const values: any[] = [];

    if (filters?.make) {
      sql += ' AND make = ?';
      values.push(filters.make);
    }
    if (filters?.model) {
      sql += ' AND model = ?';
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
    if (filters?.location) {
      sql += ' AND location LIKE ?';
      values.push(`%${filters.location}%`);
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

    return rows.map(row => ({
      carId: row.car_id,
      make: row.make,
      model: row.model,
      year: row.year,
      version: row.version,
      price: row.price,
      monthlyPayment: row.monthly_payment,
      mileage: row.mileage,
      hand: row.hand,
      transmission: row.transmission,
      fuelType: row.fuel_type,
      location: row.location,
      city: row.city,
      aggregatedData: row.aggregated_data ? JSON.parse(row.aggregated_data) : undefined,
      images: row.images ? JSON.parse(row.images) : undefined,
      listingUrl: row.listing_url,
      postedDate: row.posted_date,
    }));
  }

  /**
   * Gets the latest scraping session
   * @returns Latest session or null
   */
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
      SELECT * FROM scraping_sessions_freesbe
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

  /**
   * Gets the last scraping session (alias for getLatestSession for compatibility)
   * @returns Last scraping session info or null
   */
  getLastScrapingSession(): {
    id: number;
    startedAt: string;
    completedAt: string | null;
    pagesScraped: number;
    listingsFound: number;
    status: string;
    errorMessage: string | null;
  } | null {
    return this.getLatestSession();
  }

  /**
   * Gets scraping sessions history
   * @param limit - Number of sessions to return
   * @returns Array of scraping sessions
   */
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
      SELECT * FROM scraping_sessions_freesbe
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

  /**
   * Closes the database connection
   */
  close(): void {
    this.db.close();
  }
}

