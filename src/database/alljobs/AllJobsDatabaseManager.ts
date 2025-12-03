import { BaseDatabaseManager } from '../base/BaseDatabaseManager';
import type { Logger } from '../../utils/logger';
import { JobSource } from '../../types/BaseJobListing';

/**
 * Database manager for AllJobs scraper
 * Extends BaseDatabaseManager with AllJobs-specific table names
 */
export class AllJobsDatabaseManager extends BaseDatabaseManager {
  /**
   * Creates a new AllJobsDatabaseManager instance
   * @param dbPath - Path to SQLite database file
   * @param logger - Logger instance
   */
  constructor(dbPath: string, logger: Logger) {
    super(dbPath, logger, JobSource.ALLJOBS);
  }

  /**
   * Gets the table name for AllJobs jobs
   * @returns Table name: 'jobs_alljobs'
   */
  protected getJobsTableName(): string {
    return 'jobs_alljobs';
  }

  /**
   * Gets the table name for AllJobs scraping sessions
   * @returns Table name: 'scraping_sessions_alljobs'
   */
  protected getSessionsTableName(): string {
    return 'scraping_sessions_alljobs';
  }
}

