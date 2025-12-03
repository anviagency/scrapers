import { BaseDatabaseManager } from '../base/BaseDatabaseManager';
import type { Logger } from '../../utils/logger';
import { JobSource } from '../../types/BaseJobListing';

/**
 * Database manager for JobMaster scraper
 * Extends BaseDatabaseManager with JobMaster-specific table names
 */
export class JobMasterDatabaseManager extends BaseDatabaseManager {
  /**
   * Creates a new JobMasterDatabaseManager instance
   * @param dbPath - Path to SQLite database file
   * @param logger - Logger instance
   */
  constructor(dbPath: string, logger: Logger) {
    super(dbPath, logger, JobSource.JOBMASTER);
  }

  /**
   * Gets the table name for JobMaster jobs
   * @returns Table name: 'jobs_jobmaster'
   */
  protected getJobsTableName(): string {
    return 'jobs_jobmaster';
  }

  /**
   * Gets the table name for JobMaster scraping sessions
   * @returns Table name: 'scraping_sessions_jobmaster'
   */
  protected getSessionsTableName(): string {
    return 'scraping_sessions_jobmaster';
  }
}

