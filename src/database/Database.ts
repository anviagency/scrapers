import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { JobListing } from '../types/JobListing';
import type { Logger } from '../utils/logger';

/**
 * Database manager for storing and retrieving job listings
 */
export class DatabaseManager {
  private db: Database.Database;
  private readonly logger: Logger;

  /**
   * Creates a new DatabaseManager instance
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
  private initializeSchema(): void {
    try {
      // Try to find schema.sql in multiple locations
      let schemaPath = path.join(__dirname, 'schema.sql');
      
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

      if (!fs.existsSync(schemaPath)) {
        // If file doesn't exist, create schema inline
        this.logger.warn('Schema file not found, creating schema inline');
        this.createSchemaInline();
        return;
      }

      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
      this.logger.info('Database schema initialized from file', { schemaPath });
    } catch (error) {
      this.logger.error('Failed to initialize database schema from file, trying inline', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to inline schema creation
      try {
        this.createSchemaInline();
      } catch (inlineError) {
        this.logger.error('Failed to create schema inline', {
          error: inlineError instanceof Error ? inlineError.message : String(inlineError),
        });
        throw inlineError;
      }
    }
  }

  /**
   * Creates database schema inline (fallback when schema.sql is not found)
   */
  private createSchemaInline(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        job_type TEXT NOT NULL,
        requirements TEXT,
        application_url TEXT NOT NULL,
        posted_date TEXT,
        company_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scraping_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        pages_scraped INTEGER DEFAULT 0,
        jobs_found INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
      CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
      CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON scraping_sessions(status);
    `;
    this.db.exec(schema);
    this.logger.info('Database schema initialized inline');
  }

  /**
   * Inserts or updates a job listing
   * @param job - Job listing to insert/update
   * @returns Inserted/updated job ID
   */
  upsertJob(job: JobListing): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO jobs (
          job_id, title, company, description, location, job_type,
          requirements, application_url, posted_date, company_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(job_id) DO UPDATE SET
          title = excluded.title,
          company = excluded.company,
          description = excluded.description,
          location = excluded.location,
          job_type = excluded.job_type,
          requirements = excluded.requirements,
          application_url = excluded.application_url,
          posted_date = excluded.posted_date,
          company_id = excluded.company_id,
          updated_at = CURRENT_TIMESTAMP
      `);

      const result = stmt.run(
        job.jobId,
        job.title,
        job.company,
        job.description,
        job.location,
        job.jobType,
        job.requirements || null,
        job.applicationUrl,
        job.postedDate || null,
        job.companyId || null
      );

      return result.lastInsertRowid as number;
    } catch (error) {
      this.logger.error('Failed to upsert job', {
        jobId: job.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Inserts multiple job listings in a transaction
   * @param jobs - Array of job listings
   * @returns Number of jobs inserted/updated
   */
  upsertJobs(jobs: JobListing[]): number {
    const insert = this.db.prepare(`
      INSERT INTO jobs (
        job_id, title, company, description, location, job_type,
        requirements, application_url, posted_date, company_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(job_id) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        description = excluded.description,
        location = excluded.location,
        job_type = excluded.job_type,
        requirements = excluded.requirements,
        application_url = excluded.application_url,
        posted_date = excluded.posted_date,
        company_id = excluded.company_id,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertMany = this.db.transaction((jobs: JobListing[]) => {
      let count = 0;
      for (const job of jobs) {
        insert.run(
          job.jobId,
          job.title,
          job.company,
          job.description,
          job.location,
          job.jobType,
          job.requirements || null,
          job.applicationUrl,
          job.postedDate || null,
          job.companyId || null
        );
        count++;
      }
      return count;
    });

    try {
      const count = insertMany(jobs);
      this.logger.info('Bulk upsert completed', { count });
      return count;
    } catch (error) {
      this.logger.error('Failed to bulk upsert jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets all jobs with optional filters
   * @param filters - Optional filters (limit, offset, company, location, jobType, dateFrom, dateTo)
   * @returns Array of job listings
   */
  getJobs(filters?: {
    limit?: number;
    offset?: number;
    company?: string;
    location?: string;
    jobType?: string;
    dateFrom?: string;
    dateTo?: string;
  }): JobListing[] {
    try {
      let query = 'SELECT * FROM jobs WHERE 1=1';
      const params: unknown[] = [];

      if (filters?.company) {
        query += ' AND LOWER(company) LIKE LOWER(?)';
        params.push(`%${filters.company}%`);
      }

      if (filters?.location) {
        // Search in both Hebrew and English location names
        query += ' AND (LOWER(location) LIKE LOWER(?) OR LOWER(location) LIKE LOWER(?))';
        params.push(`%${filters.location}%`);
        // Map Hebrew to English for better matching
        const locationMap: Record<string, string> = {
          'תל אביב': 'tel aviv',
          'ירושלים': 'jerusalem',
          'חיפה': 'haifa',
          'בני ברק': 'bnei brak',
          'רמת גן': 'ramat gan',
          'גבעתיים': 'givatayim',
          'רעננה': 'raanana',
          'הרצליה': 'herzliya',
          'נתניה': 'netanya',
          'אשדוד': 'ashdod',
          'באר שבע': 'beer sheva',
          'ראשון לציון': 'rishon lezion',
          'רחובות': 'rehovot',
          'רמת השרון': 'ramat hasharon',
        };
        const englishLocation = locationMap[filters.location.toLowerCase()] || filters.location;
        params.push(`%${englishLocation}%`);
      }

      if (filters?.jobType) {
        query += ' AND LOWER(job_type) LIKE LOWER(?)';
        params.push(`%${filters.jobType}%`);
      }

      if (filters?.dateFrom) {
        query += ' AND DATE(created_at) >= ?';
        params.push(filters.dateFrom);
      }

      if (filters?.dateTo) {
        query += ' AND DATE(created_at) <= ?';
        params.push(filters.dateTo);
      }

      query += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters?.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as Array<{
        id: number;
        job_id: string;
        title: string;
        company: string;
        description: string;
        location: string;
        job_type: string;
        requirements: string | null;
        application_url: string;
        posted_date: string | null;
        company_id: string | null;
        created_at: string;
        updated_at: string;
      }>;

      return rows.map((row) => ({
        jobId: row.job_id,
        title: row.title,
        company: row.company,
        description: row.description,
        location: row.location,
        jobType: row.job_type,
        requirements: row.requirements || undefined,
        applicationUrl: row.application_url,
        postedDate: row.posted_date || undefined,
        companyId: row.company_id || undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to get jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets the underlying database instance (for advanced queries)
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Gets total count of jobs
   * @param filters - Optional filters
   * @returns Total count
   */
  getJobsCount(filters?: {
    company?: string;
    location?: string;
    jobType?: string;
    dateFrom?: string;
    dateTo?: string;
  }): number {
    try {
      let query = 'SELECT COUNT(*) as count FROM jobs WHERE 1=1';
      const params: unknown[] = [];

      if (filters?.company) {
        query += ' AND LOWER(company) LIKE LOWER(?)';
        params.push(`%${filters.company}%`);
      }

      if (filters?.location) {
        // Search in both Hebrew and English location names
        query += ' AND (LOWER(location) LIKE LOWER(?) OR LOWER(location) LIKE LOWER(?))';
        params.push(`%${filters.location}%`);
        // Map Hebrew to English for better matching
        const locationMap: Record<string, string> = {
          'תל אביב': 'tel aviv',
          'ירושלים': 'jerusalem',
          'חיפה': 'haifa',
          'בני ברק': 'bnei brak',
          'רמת גן': 'ramat gan',
          'גבעתיים': 'givatayim',
          'רעננה': 'raanana',
          'הרצליה': 'herzliya',
          'נתניה': 'netanya',
          'אשדוד': 'ashdod',
          'באר שבע': 'beer sheva',
          'ראשון לציון': 'rishon lezion',
          'רחובות': 'rehovot',
          'רמת השרון': 'ramat hasharon',
        };
        const englishLocation = locationMap[filters.location.toLowerCase()] || filters.location;
        params.push(`%${englishLocation}%`);
      }

      if (filters?.jobType) {
        query += ' AND LOWER(job_type) LIKE LOWER(?)';
        params.push(`%${filters.jobType}%`);
      }

      if (filters?.dateFrom) {
        query += ' AND DATE(created_at) >= ?';
        params.push(filters.dateFrom);
      }

      if (filters?.dateTo) {
        query += ' AND DATE(created_at) <= ?';
        params.push(filters.dateTo);
      }

      const stmt = this.db.prepare(query);
      const result = stmt.get(...params) as { count: number };
      return result.count;
    } catch (error) {
      this.logger.error('Failed to get jobs count', {
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
    try {
      const stmt = this.db.prepare(
        'INSERT INTO scraping_sessions (status) VALUES (?)'
      );
      const result = stmt.run('running');
      return result.lastInsertRowid as number;
    } catch (error) {
      this.logger.error('Failed to create scraping session', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Updates scraping session
   * @param sessionId - Session ID
   * @param updates - Updates to apply
   */
  updateScrapingSession(
    sessionId: number,
    updates: {
      pagesScraped?: number;
      jobsFound?: number;
      status?: 'running' | 'completed' | 'failed';
      errorMessage?: string;
    }
  ): void {
    try {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.pagesScraped !== undefined) {
        fields.push('pages_scraped = ?');
        values.push(updates.pagesScraped);
      }

      if (updates.jobsFound !== undefined) {
        fields.push('jobs_found = ?');
        values.push(updates.jobsFound);
      }

      if (updates.status) {
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
      const query = `UPDATE scraping_sessions SET ${fields.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(query);
      stmt.run(...values);
    } catch (error) {
      this.logger.error('Failed to update scraping session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets the last scraping session
   * @returns Last scraping session info or null
   */
  getLastScrapingSession(): {
    id: number;
    startedAt: string;
    completedAt: string | null;
    pagesScraped: number;
    jobsFound: number;
    status: string;
    errorMessage: string | null;
  } | null {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM scraping_sessions ORDER BY started_at DESC LIMIT 1'
      );
      const row = stmt.get() as {
        id: number;
        started_at: string;
        completed_at: string | null;
        pages_scraped: number;
        jobs_found: number;
        status: string;
        error_message: string | null;
      } | undefined;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        pagesScraped: row.pages_scraped,
        jobsFound: row.jobs_found,
        status: row.status,
        errorMessage: row.error_message,
      };
    } catch (error) {
      this.logger.error('Failed to get last scraping session', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
    jobsFound: number;
    status: string;
    errorMessage: string | null;
  }> {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM scraping_sessions ORDER BY started_at DESC LIMIT ?'
      );
      const rows = stmt.all(limit) as Array<{
        id: number;
        started_at: string;
        completed_at: string | null;
        pages_scraped: number;
        jobs_found: number;
        status: string;
        error_message: string | null;
      }>;

      return rows.map((row) => ({
        id: row.id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        pagesScraped: row.pages_scraped,
        jobsFound: row.jobs_found,
        status: row.status,
        errorMessage: row.error_message,
      }));
    } catch (error) {
      this.logger.error('Failed to get scraping sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Closes database connection
   */
  close(): void {
    this.db.close();
    this.logger.info('Database connection closed');
  }
}

