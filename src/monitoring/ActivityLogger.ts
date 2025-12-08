import type { Logger } from '../utils/logger';
import { ActivityDatabase } from './ActivityDatabase';

/**
 * Activity types that can be logged
 */
export type ActivityType = 'http_request' | 'parsing' | 'database' | 'error' | 'proxy';

/**
 * Activity status
 */
export type ActivityStatus = 'success' | 'error' | 'warning' | 'retry';

/**
 * Scraper source
 */
export type ActivitySource = 'alljobs' | 'jobmaster' | 'madlan' | 'carwiz' | 'freesbe';

/**
 * Activity details structure
 */
export interface ActivityDetails {
  url?: string;
  method?: string;
  statusCode?: number;
  responseTimeMs?: number;
  proxyUsed?: boolean;
  proxyHost?: string;
  error?: string;
  retryCount?: number;
  category?: string;
  page?: number;
  itemsFound?: number;
  itemsSaved?: number;
  operation?: string;
  listingType?: string;
  [key: string]: unknown; // Index signature for flexibility
}

/**
 * Activity log entry
 */
export interface Activity {
  id: string;
  timestamp: Date;
  source: ActivitySource;
  type: ActivityType;
  status: ActivityStatus;
  details: ActivityDetails;
  message: string;
}

/**
 * ActivityLogger - Singleton class for logging all operations
 * Stores activities in shared database so all scraper processes can access them
 */
export class ActivityLogger {
  private static instance: ActivityLogger | null = null;
  private readonly activities: Activity[] = []; // In-memory cache for quick access
  private readonly maxActivities: number = 500; // Keep last 500 in memory
  private readonly logger: Logger;
  private readonly activityDb: ActivityDatabase;
  private activityCounter: number = 0;

  private constructor(logger: Logger) {
    this.logger = logger;
    this.activityDb = new ActivityDatabase(logger);
    this.logger.info('ActivityLogger initialized with database storage');
  }

  /**
   * Get or create the singleton instance
   */
  public static getInstance(logger?: Logger): ActivityLogger {
    if (!ActivityLogger.instance) {
      if (!logger) {
        throw new Error('Logger is required for first initialization of ActivityLogger');
      }
      ActivityLogger.instance = new ActivityLogger(logger);
    }
    return ActivityLogger.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    ActivityLogger.instance = null;
  }

  /**
   * Log an HTTP request
   */
  public logHttpRequest(
    source: ActivitySource,
    url: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    proxyUsed: boolean,
    proxyHost?: string,
    error?: string,
    retryCount?: number
  ): void {
    const status: ActivityStatus = error ? 'error' : statusCode >= 200 && statusCode < 400 ? 'success' : 'warning';
    const message = error
      ? `HTTP ${method} ${url} failed: ${error}`
      : `HTTP ${method} ${url} - ${statusCode} (${responseTimeMs}ms)`;

    this.log({
      source,
      type: 'http_request',
      status,
      details: {
        url,
        method,
        statusCode,
        responseTimeMs,
        proxyUsed,
        proxyHost,
        error,
        retryCount,
      },
      message,
    });
  }

  /**
   * Log a parsing operation
   */
  public logParsing(
    source: ActivitySource,
    category: string,
    page: number,
    itemsFound: number,
    error?: string
  ): void {
    const status: ActivityStatus = error ? 'error' : 'success';
    const message = error
      ? `Parsing failed for ${category} page ${page}: ${error}`
      : `Parsed ${category} page ${page} - found ${itemsFound} items`;

    this.log({
      source,
      type: 'parsing',
      status,
      details: {
        category,
        page,
        itemsFound,
        error,
      },
      message,
    });
  }

  /**
   * Log a database operation
   */
  public logDatabase(
    source: ActivitySource,
    operation: string,
    itemsSaved: number,
    error?: string
  ): void {
    const status: ActivityStatus = error ? 'error' : 'success';
    const message = error
      ? `Database ${operation} failed: ${error}`
      : `Database ${operation} - saved ${itemsSaved} items`;

    this.log({
      source,
      type: 'database',
      status,
      details: {
        operation,
        itemsSaved,
        error,
      },
      message,
    });
  }

  /**
   * Log an error
   */
  public logError(
    source: ActivitySource,
    error: string,
    details?: ActivityDetails
  ): void {
    this.log({
      source,
      type: 'error',
      status: 'error',
      details: {
        ...details,
        error,
      },
      message: `Error in ${source}: ${error}`,
    });
  }

  /**
   * Log a proxy event
   */
  public logProxyEvent(
    source: ActivitySource,
    event: string,
    proxyHost: string,
    success: boolean,
    error?: string
  ): void {
    const status: ActivityStatus = success ? 'success' : 'error';
    const message = success
      ? `Proxy event: ${event} via ${proxyHost}`
      : `Proxy event failed: ${event} via ${proxyHost} - ${error}`;

    this.log({
      source,
      type: 'proxy',
      status,
      details: {
        proxyHost,
        error,
        operation: event,
      },
      message,
    });
  }

  /**
   * Get activities with optional filtering
   * Reads from shared database to get activities from all scraper processes
   */
  public getActivities(options: {
    source?: ActivitySource;
    type?: ActivityType;
    status?: ActivityStatus;
    limit?: number;
    offset?: number;
  } = {}): Activity[] {
    // Read from shared database (includes activities from all processes)
    return this.activityDb.getActivities(options);
  }

  /**
   * Get total count of activities (optionally filtered)
   */
  public getActivityCount(options: {
    source?: ActivitySource;
    type?: ActivityType;
    status?: ActivityStatus;
  } = {}): number {
    return this.activityDb.getActivityCount(options);
  }

  /**
   * Clear all activities
   */
  public clear(): void {
    this.activities.length = 0;
    this.activityCounter = 0;
    this.activityDb.clear();
    this.logger.info('All activities cleared');
  }

  /**
   * Internal method to log an activity
   */
  private log(activity: Omit<Activity, 'id' | 'timestamp'>): void {
    const fullActivity: Activity = {
      id: `activity-${++this.activityCounter}-${Date.now()}`,
      timestamp: new Date(),
      ...activity,
    };

    // Add to in-memory cache (circular buffer)
    this.activities.push(fullActivity);
    if (this.activities.length > this.maxActivities) {
      this.activities.shift();
    }

    // Save to shared database (so all processes can access it)
    try {
      this.activityDb.saveActivity(fullActivity);
    } catch (error) {
      // Don't fail if database save fails, just log it
      this.logger.debug('Failed to save activity to database (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Also log to logger based on status
    if (activity.status === 'error') {
      this.logger.error(activity.message, activity.details as Record<string, unknown>);
    } else if (activity.status === 'warning') {
      this.logger.warn(activity.message, activity.details as Record<string, unknown>);
    } else {
      this.logger.debug(activity.message, activity.details as Record<string, unknown>);
    }
  }
}

