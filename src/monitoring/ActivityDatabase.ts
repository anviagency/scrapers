import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from '../utils/logger';
import type { Activity, ActivityDetails, ActivitySource, ActivityType, ActivityStatus } from './ActivityLogger';

/**
 * Database manager for storing activities across all scraper processes
 * Uses a shared SQLite database so all scrapers can write to the same location
 */
export class ActivityDatabase {
  private db: Database.Database;
  private readonly logger: Logger;
  private readonly maxActivities: number = 1000; // Keep last 1000 activities in database

  constructor(logger: Logger, dbPath?: string) {
    this.logger = logger;
    
    // Use shared database path
    const activitiesDbPath = dbPath || path.join(process.cwd(), 'data', 'activities.db');
    
    // Ensure database directory exists
    const dbDir = path.dirname(activitiesDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(activitiesDbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    try {
      const schema = `
        CREATE TABLE IF NOT EXISTS activities_shared (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          activity_id TEXT NOT NULL UNIQUE,
          timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          source TEXT NOT NULL CHECK(source IN ('alljobs', 'jobmaster', 'madlan', 'carwiz', 'freesbe')),
          type TEXT NOT NULL CHECK(type IN ('http_request', 'parsing', 'database', 'error', 'proxy')),
          status TEXT NOT NULL CHECK(status IN ('success', 'error', 'warning', 'retry')),
          message TEXT NOT NULL,
          details_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_activities_shared_timestamp ON activities_shared(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_activities_shared_source ON activities_shared(source);
        CREATE INDEX IF NOT EXISTS idx_activities_shared_type ON activities_shared(type);
        CREATE INDEX IF NOT EXISTS idx_activities_shared_status ON activities_shared(status);
        CREATE INDEX IF NOT EXISTS idx_activities_shared_source_type ON activities_shared(source, type);
        CREATE INDEX IF NOT EXISTS idx_activities_shared_source_status ON activities_shared(source, status);
      `;
      
      this.db.exec(schema);
      this.logger.info('Activity database schema initialized');
    } catch (error) {
      this.logger.error('Failed to initialize activity database schema', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Save an activity to the database
   */
  public saveActivity(activity: Activity): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO activities_shared (activity_id, timestamp, source, type, status, message, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        activity.id,
        activity.timestamp.toISOString(),
        activity.source,
        activity.type,
        activity.status,
        activity.message,
        JSON.stringify(activity.details)
      );

      // Clean up old activities - keep only last maxActivities
      this.cleanupOldActivities();
    } catch (error) {
      // Ignore duplicate key errors (activity_id UNIQUE constraint)
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        return;
      }
      this.logger.error('Failed to save activity to database', {
        error: error instanceof Error ? error.message : String(error),
        activityId: activity.id,
      });
    }
  }

  /**
   * Get activities with optional filtering
   */
  public getActivities(options: {
    source?: ActivitySource;
    type?: ActivityType;
    status?: ActivityStatus;
    limit?: number;
    offset?: number;
  } = {}): Activity[] {
    try {
      let query = 'SELECT * FROM activities_shared WHERE 1=1';
      const params: any[] = [];

      if (options.source) {
        query += ' AND source = ?';
        params.push(options.source);
      }
      if (options.type) {
        query += ' AND type = ?';
        params.push(options.type);
      }
      if (options.status) {
        query += ' AND status = ?';
        params.push(options.status);
      }

      query += ' ORDER BY timestamp DESC';

      const limit = options.limit || 100;
      const offset = options.offset || 0;
      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as Array<{
        id: number;
        activity_id: string;
        timestamp: string;
        source: string;
        type: string;
        status: string;
        message: string;
        details_json: string;
        created_at: string;
      }>;

      return rows.map(row => ({
        id: row.activity_id,
        timestamp: new Date(row.timestamp),
        source: row.source as ActivitySource,
        type: row.type as 'http_request' | 'parsing' | 'database' | 'error' | 'proxy',
        status: row.status as 'success' | 'error' | 'warning' | 'retry',
        message: row.message,
        details: row.details_json ? JSON.parse(row.details_json) as ActivityDetails : {},
      }));
    } catch (error) {
      this.logger.error('Failed to get activities from database', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get total count of activities (optionally filtered)
   */
  public getActivityCount(options: {
    source?: ActivitySource;
    type?: ActivityType;
    status?: ActivityStatus;
  } = {}): number {
    try {
      let query = 'SELECT COUNT(*) as count FROM activities_shared WHERE 1=1';
      const params: any[] = [];

      if (options.source) {
        query += ' AND source = ?';
        params.push(options.source);
      }
      if (options.type) {
        query += ' AND type = ?';
        params.push(options.type);
      }
      if (options.status) {
        query += ' AND status = ?';
        params.push(options.status);
      }

      const stmt = this.db.prepare(query);
      const result = stmt.get(...params) as { count: number };
      return result.count;
    } catch (error) {
      this.logger.error('Failed to get activity count from database', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Clean up old activities, keeping only the last maxActivities
   */
  private cleanupOldActivities(): void {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM activities_shared');
      const countResult = countStmt.get() as { count: number };

      if (countResult.count > this.maxActivities) {
        const deleteCount = countResult.count - this.maxActivities;
        const deleteStmt = this.db.prepare(`
          DELETE FROM activities_shared
          WHERE id IN (
            SELECT id FROM activities_shared
            ORDER BY timestamp ASC
            LIMIT ?
          )
        `);
        deleteStmt.run(deleteCount);
        this.logger.debug(`Cleaned up ${deleteCount} old activities`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old activities', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear all activities
   */
  public clear(): void {
    try {
      const stmt = this.db.prepare('DELETE FROM activities_shared');
      stmt.run();
      this.logger.info('All activities cleared from database');
    } catch (error) {
      this.logger.error('Failed to clear activities', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }
}

