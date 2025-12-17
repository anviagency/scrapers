import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { BaseJobListing } from '../../types/BaseJobListing';
import type { Logger } from '../../utils/logger';
import { JobSource } from '../../types/BaseJobListing';

/**
 * Abstract base class for database managers
 * Each source-specific database manager should extend this class
 */
export abstract class BaseDatabaseManager {
  protected db: Database.Database;
  protected readonly logger: Logger;
  protected readonly source: JobSource;

  /**
   * Creates a new BaseDatabaseManager instance
   * @param dbPath - Path to SQLite database file
   * @param logger - Logger instance
   * @param source - Job source (alljobs or jobmaster)
   */
  constructor(dbPath: string, logger: Logger, source: JobSource) {
    this.logger = logger;
    this.source = source;

    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initializeSchema();
    this.migrateSchema(); // Run migrations after schema initialization
  }

  /**
   * Gets the table name for jobs
   * Must be implemented by source-specific managers
   * @returns Table name (e.g., 'jobs_alljobs' or 'jobs_jobmaster')
   */
  protected abstract getJobsTableName(): string;

  /**
   * Gets the table name for scraping sessions
   * Must be implemented by source-specific managers
   * @returns Table name (e.g., 'scraping_sessions_alljobs' or 'scraping_sessions_jobmaster')
   */
  protected abstract getSessionsTableName(): string;

  /**
   * Initializes database schema
   * Calls abstract methods to get table names
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
        this.logger.info('Database schema initialized from file', { schemaPath, source: this.source });
      } else {
        // If file doesn't exist, create schema inline
        this.logger.warn('Schema file not found, creating schema inline', { source: this.source });
        this.createSchemaInline();
      }
    } catch (error) {
      this.logger.error('Failed to initialize database schema from file, trying inline', {
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
      });
      // Fallback to inline schema creation
      try {
        this.createSchemaInline();
      } catch (inlineError) {
        this.logger.error('Failed to create schema inline', {
          error: inlineError instanceof Error ? inlineError.message : String(inlineError),
          source: this.source,
        });
        throw inlineError;
      }
    }
  }

  /**
   * Creates database schema inline (fallback when schema.sql is not found)
   * Uses abstract methods to get table names
   */
  protected createSchemaInline(): void {
    const jobsTable = this.getJobsTableName();
    const sessionsTable = this.getSessionsTableName();

    const schema = `
      CREATE TABLE IF NOT EXISTS ${jobsTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        job_type TEXT NOT NULL,
        category TEXT,
        requirements TEXT,
        target_audience TEXT,
        application_url TEXT NOT NULL,
        posted_date TEXT,
        company_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${sessionsTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        pages_scraped INTEGER DEFAULT 0,
        jobs_found INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_${jobsTable}_job_id ON ${jobsTable}(job_id);
      CREATE INDEX IF NOT EXISTS idx_${jobsTable}_company ON ${jobsTable}(company);
      CREATE INDEX IF NOT EXISTS idx_${jobsTable}_location ON ${jobsTable}(location);
      CREATE INDEX IF NOT EXISTS idx_${jobsTable}_job_type ON ${jobsTable}(job_type);
      CREATE INDEX IF NOT EXISTS idx_${jobsTable}_created_at ON ${jobsTable}(created_at);
      CREATE INDEX IF NOT EXISTS idx_${sessionsTable}_status ON ${sessionsTable}(status);
    `;
    this.db.exec(schema);
    this.logger.info('Database schema initialized inline', { source: this.source });
  }

  /**
   * Migrates database schema to add new columns if they don't exist
   * This ensures backward compatibility with existing databases
   */
  protected migrateSchema(): void {
    try {
      const tableName = this.getJobsTableName();
      
      // Get all existing columns
      const tableInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
      const columnNames = tableInfo.map((col) => col.name);
      
      // Check if target_audience column exists
      const hasTargetAudience = columnNames.includes('target_audience');
      if (!hasTargetAudience) {
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN target_audience TEXT`);
        this.logger.info('Added target_audience column to database', { source: this.source });
      }
      
      // Check if category column exists
      const hasCategory = columnNames.includes('category');
      if (!hasCategory) {
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN category TEXT`);
        this.logger.info('Added category column to database', { source: this.source });
      }
    } catch (error) {
      this.logger.warn('Migration failed (column may already exist)', {
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
      });
    }
  }

  /**
   * Inserts or updates job listings
   * @param jobs - Array of job listings to insert/update
   * @returns Number of jobs inserted/updated
   */
  upsertJobs(jobs: BaseJobListing[]): number {
    if (jobs.length === 0) {
      return 0;
    }

    const tableName = this.getJobsTableName();
    const insert = this.db.prepare(`
      INSERT INTO ${tableName} (
        job_id, title, company, description, location, job_type, category,
        requirements, target_audience, application_url, posted_date, company_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(job_id) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        description = excluded.description,
        location = excluded.location,
        job_type = excluded.job_type,
        category = excluded.category,
        requirements = excluded.requirements,
        target_audience = excluded.target_audience,
        application_url = excluded.application_url,
        posted_date = excluded.posted_date,
        company_id = excluded.company_id,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertMany = this.db.transaction((jobsList: BaseJobListing[]) => {
      let count = 0;
      for (const job of jobsList) {
        insert.run(
          job.jobId,
          job.title,
          job.company,
          job.description,
          job.location,
          job.jobType,
          (job as any).category || null, // category is optional
          job.requirements || null,
          job.targetAudience || null,
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
      this.logger.info('Bulk upsert completed', { count, source: this.source });
      return count;
    } catch (error) {
      this.logger.error('Failed to bulk upsert jobs', {
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
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
  }): BaseJobListing[] {
    try {
      const tableName = this.getJobsTableName();
      let query = `SELECT * FROM ${tableName} WHERE 1=1`;
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
        category: string | null;
        requirements: string | null;
        target_audience: string | null;
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
        category: row.category || undefined,
        requirements: row.requirements || undefined,
        targetAudience: row.target_audience || undefined,
        applicationUrl: row.application_url,
        postedDate: row.posted_date || undefined,
        companyId: row.company_id || undefined,
        source: this.source,
      }));
    } catch (error) {
      this.logger.error('Failed to get jobs', {
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
      });
      throw error;
    }
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
      const tableName = this.getJobsTableName();
      let query = `SELECT COUNT(*) as count FROM ${tableName} WHERE 1=1`;
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
        source: this.source,
      });
      throw error;
    }
  }

  /**
   * Checks which job IDs from the given list already exist in the database
   * Memory-efficient batch query approach
   * @param jobIds - Array of job IDs to check
   * @returns Set of job IDs that already exist in the database
   */
  getExistingJobIdsFromList(jobIds: string[]): Set<string> {
    if (jobIds.length === 0) {
      return new Set();
    }

    try {
      const tableName = this.getJobsTableName();
      // SQLite supports up to 999 variables, but we'll be conservative
      const placeholders = jobIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`SELECT job_id FROM ${tableName} WHERE job_id IN (${placeholders})`);
      const rows = stmt.all(...jobIds) as Array<{ job_id: string }>;
      return new Set(rows.map((row) => row.job_id));
    } catch (error) {
      this.logger.error('Failed to check existing job IDs', {
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
        batchSize: jobIds.length,
      });
      return new Set();
    }
  }

  /**
   * Gets a single job by ID
   * @param jobId - Job ID to retrieve
   * @returns Job listing or null if not found
   */
  getJobById(jobId: string): BaseJobListing | null {
    try {
      const tableName = this.getJobsTableName();
      const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE job_id = ?`);
      const row = stmt.get(jobId) as {
        id: number;
        job_id: string;
        title: string;
        company: string;
        description: string;
        location: string;
        job_type: string;
        category: string | null;
        requirements: string | null;
        application_url: string;
        posted_date: string | null;
        company_id: string | null;
        created_at: string;
        updated_at: string;
      } | undefined;

      if (!row) {
        return null;
      }

      return {
        jobId: row.job_id,
        title: row.title,
        company: row.company,
        description: row.description,
        location: row.location,
        jobType: row.job_type,
        category: row.category || undefined,
        requirements: row.requirements || undefined,
        applicationUrl: row.application_url,
        postedDate: row.posted_date || undefined,
        companyId: row.company_id || undefined,
        source: this.source,
      };
    } catch (error) {
      this.logger.error('Failed to get job by ID', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
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
      const tableName = this.getSessionsTableName();
      const stmt = this.db.prepare(
        `INSERT INTO ${tableName} (status) VALUES (?)`
      );
      const result = stmt.run('running');
      return result.lastInsertRowid as number;
    } catch (error) {
      this.logger.error('Failed to create scraping session', {
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
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
      const tableName = this.getSessionsTableName();
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
      const query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(query);
      stmt.run(...values);
    } catch (error) {
      this.logger.error('Failed to update scraping session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        source: this.source,
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
      const tableName = this.getSessionsTableName();
      const stmt = this.db.prepare(
        `SELECT * FROM ${tableName} ORDER BY started_at DESC LIMIT 1`
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
        source: this.source,
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
      const tableName = this.getSessionsTableName();
      const stmt = this.db.prepare(
        `SELECT * FROM ${tableName} ORDER BY started_at DESC LIMIT ?`
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
        source: this.source,
      });
      return [];
    }
  }

  /**
   * Closes database connection
   */
  close(): void {
    this.db.close();
    this.logger.info('Database connection closed', { source: this.source });
  }
}

