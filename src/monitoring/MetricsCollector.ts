import type { Logger } from '../utils/logger';
import {
  ScraperMetrics,
  ScraperStatus,
  HealthStatus,
  AggregatedMetrics,
  HealthCheckResult,
  createEmptyMetrics,
  calculateHealthStatus,
} from './ScraperMetrics';
import { ActivityLogger } from './ActivityLogger';

/**
 * Event emitted when metrics are updated
 */
export interface MetricsUpdateEvent {
  source: string;
  metrics: ScraperMetrics;
}

/**
 * MetricsCollector - Centralized metrics collection and reporting
 * Singleton pattern for global access
 */
export class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  
  private readonly metrics: Map<string, ScraperMetrics> = new Map();
  private readonly requestTimestamps: Map<string, number[]> = new Map();
  private readonly responseTimesMs: Map<string, number[]> = new Map();
  private readonly logger: Logger;
  
  private constructor(logger: Logger) {
    this.logger = logger;
    this.logger.info('MetricsCollector initialized');
  }

  /**
   * Get or create the singleton instance
   */
  static getInstance(logger?: Logger): MetricsCollector {
    if (!MetricsCollector.instance) {
      if (!logger) {
        throw new Error('Logger is required for first initialization of MetricsCollector');
      }
      MetricsCollector.instance = new MetricsCollector(logger);
    }
    return MetricsCollector.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    MetricsCollector.instance = null;
  }

  /**
   * Initialize metrics for a scraper
   */
  initializeScraper(source: string): void {
    this.metrics.set(source, createEmptyMetrics(source));
    this.requestTimestamps.set(source, []);
    this.responseTimesMs.set(source, []);
    this.logger.debug(`Metrics initialized for scraper: ${source}`);
  }

  /**
   * Record scraper start
   */
  recordStart(source: string): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.status = ScraperStatus.RUNNING;
    metrics.startTime = new Date();
    metrics.lastActivityTime = new Date();
    metrics.totalErrors = 0;
    metrics.consecutiveErrors = 0;
    metrics.totalPagesScraped = 0;
    metrics.itemsFound = 0;
    metrics.itemsSaved = 0;
    this.logger.info(`Scraper started: ${source}`);
  }

  /**
   * Record scraper stop
   */
  recordStop(source: string, completed: boolean = true): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.status = completed ? ScraperStatus.COMPLETED : ScraperStatus.IDLE;
    metrics.lastActivityTime = new Date();
    this.logger.info(`Scraper stopped: ${source}`, { completed });
  }

  /**
   * Record page scraped
   */
  recordPageScraped(source: string, category: string, page: number): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.currentCategory = category;
    metrics.currentPage = page;
    metrics.totalPagesScraped++;
    metrics.lastActivityTime = new Date();
    metrics.consecutiveErrors = 0; // Reset on success
  }

  /**
   * Record items found and saved
   */
  recordItems(source: string, found: number, saved: number, duplicates: number = 0): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.itemsFound += found;
    metrics.itemsSaved += saved;
    metrics.duplicatesSkipped += duplicates;
    metrics.lastActivityTime = new Date();
  }

  /**
   * Record HTTP request
   */
  recordRequest(source: string, responseTimeMs: number, success: boolean): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.requestsTotal++;
    
    // Store timestamps for RPM calculation
    const timestamps = this.requestTimestamps.get(source) || [];
    timestamps.push(Date.now());
    // Keep only last 60 seconds of timestamps
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps.set(source, timestamps.filter(t => t > oneMinuteAgo));
    
    // Store response times for average calculation
    const times = this.responseTimesMs.get(source) || [];
    times.push(responseTimeMs);
    // Keep only last 100 response times
    if (times.length > 100) times.shift();
    this.responseTimesMs.set(source, times);
    
    // Calculate RPM and average response time
    const recentTimestamps = this.requestTimestamps.get(source) || [];
    metrics.requestsPerMinute = recentTimestamps.length;
    
    const recentTimes = this.responseTimesMs.get(source) || [];
    metrics.averageResponseTimeMs = recentTimes.length > 0
      ? Math.round(recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length)
      : 0;

    if (!success) {
      metrics.totalErrors++;
      metrics.consecutiveErrors++;
    } else {
      metrics.consecutiveErrors = 0;
    }
    
    // Update health status
    metrics.healthStatus = calculateHealthStatus(
      metrics.requestsTotal,
      metrics.totalErrors,
      metrics.consecutiveErrors
    );
    
    metrics.lastActivityTime = new Date();
  }

  /**
   * Record error
   */
  recordError(source: string, error: string): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.totalErrors++;
    metrics.consecutiveErrors++;
    metrics.lastError = error;
    metrics.lastErrorTime = new Date();
    metrics.lastActivityTime = new Date();
    
    // Update health status
    metrics.healthStatus = calculateHealthStatus(
      metrics.requestsTotal,
      metrics.totalErrors,
      metrics.consecutiveErrors
    );

    this.logger.warn(`Scraper error recorded: ${source}`, { error, consecutiveErrors: metrics.consecutiveErrors });
  }

  /**
   * Update database count
   */
  updateDatabaseCount(source: string, count: number): void {
    const metrics = this.getOrCreateMetrics(source);
    metrics.totalItemsInDatabase = count;
  }

  /**
   * Get metrics for a specific scraper
   */
  getMetrics(source: string): ScraperMetrics | null {
    return this.metrics.get(source) || null;
  }

  /**
   * Get all metrics
   * Also reads from ActivityLogger to get real-time status from running scrapers
   */
  getAllMetrics(): AggregatedMetrics {
    // Update metrics from ActivityLogger for running scrapers
    this.updateMetricsFromActivities();

    const scraperMetrics: Record<string, ScraperMetrics> = {};
    let activeScrapers = 0;
    let healthyScrapers = 0;
    let degradedScrapers = 0;
    let unhealthyScrapers = 0;
    let totalItemsFound = 0;
    let totalItemsSaved = 0;
    let totalErrors = 0;
    let totalRPM = 0;

    this.metrics.forEach((metrics, source) => {
      scraperMetrics[source] = { ...metrics };
      
      if (metrics.status === ScraperStatus.RUNNING) {
        activeScrapers++;
      }
      
      switch (metrics.healthStatus) {
        case HealthStatus.HEALTHY:
          healthyScrapers++;
          break;
        case HealthStatus.DEGRADED:
          degradedScrapers++;
          break;
        case HealthStatus.UNHEALTHY:
          unhealthyScrapers++;
          break;
      }
      
      totalItemsFound += metrics.itemsFound;
      totalItemsSaved += metrics.itemsSaved;
      totalErrors += metrics.totalErrors;
      totalRPM += metrics.requestsPerMinute;
    });

    return {
      timestamp: new Date(),
      totalScrapers: this.metrics.size,
      activeScrapers,
      healthyScrapers,
      degradedScrapers,
      unhealthyScrapers,
      totalItemsFound,
      totalItemsSaved,
      totalErrors,
      totalRequestsPerMinute: totalRPM,
      scrapers: scraperMetrics,
    };
  }

  /**
   * Update metrics from ActivityLogger to get real-time status from running scrapers
   */
  private updateMetricsFromActivities(): void {
    try {
      const activityLogger = ActivityLogger.getInstance(this.logger);
      const sources: Array<'alljobs' | 'jobmaster' | 'madlan'> = ['alljobs', 'jobmaster', 'madlan'];

      for (const source of sources) {
        // Get last 20 activities for this source
        const activities = activityLogger.getActivities({ source, limit: 20 });

        if (activities.length === 0) {
          continue; // No activities for this source
        }

        const metrics = this.getOrCreateMetrics(source);
        
        // Find the most recent parsing activity to get current category and page
        const lastParsingActivity = activities.find(a => a.type === 'parsing');
        if (lastParsingActivity) {
          metrics.currentCategory = lastParsingActivity.details.category || '';
          metrics.currentPage = lastParsingActivity.details.page || 0;
          metrics.lastActivityTime = lastParsingActivity.timestamp;
        }

        // Count HTTP requests in the last minute
        const oneMinuteAgo = Date.now() - 60000;
        const recentRequests = activities.filter(a => 
          a.type === 'http_request' && 
          a.timestamp.getTime() > oneMinuteAgo
        );
        metrics.requestsPerMinute = recentRequests.length;

        // Calculate average response time from recent requests
        const requestTimes = activities
          .filter(a => a.type === 'http_request' && a.details.responseTimeMs)
          .slice(0, 20)
          .map(a => a.details.responseTimeMs || 0);
        
        if (requestTimes.length > 0) {
          metrics.averageResponseTimeMs = Math.round(
            requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length
          );
        }

        // Count errors
        const errors = activities.filter(a => a.status === 'error');
        metrics.totalErrors = errors.length;
        if (errors.length > 0) {
          metrics.lastError = errors[0].message;
          metrics.lastErrorTime = errors[0].timestamp;
        }

        // Check if scraper is stuck (no activity in last 2 minutes)
        const lastActivity = activities[0];
        const timeSinceLastActivity = Date.now() - lastActivity.timestamp.getTime();
        const twoMinutesAgo = 2 * 60 * 1000;
        
        if (metrics.status === ScraperStatus.RUNNING && timeSinceLastActivity > twoMinutesAgo) {
          // Scraper might be stuck
          this.logger.warn(`Scraper ${source} might be stuck - no activity for ${Math.round(timeSinceLastActivity / 1000)}s`);
        }

        // Update health status based on recent activity
        metrics.healthStatus = calculateHealthStatus(
          recentRequests.length,
          errors.length,
          errors.length > 0 ? errors.length : 0
        );
      }
    } catch (error) {
      // Don't fail if ActivityLogger is not available
      this.logger.debug('Failed to update metrics from activities', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Perform health check
   */
  getHealthCheck(): HealthCheckResult {
    const scrapers: HealthCheckResult['scrapers'] = [];
    let allHealthy = true;
    let hasRunning = false;

    this.metrics.forEach((metrics) => {
      const scraperHealth = {
        source: metrics.source,
        status: metrics.status,
        healthStatus: metrics.healthStatus,
        lastActivityTime: metrics.lastActivityTime,
        error: metrics.lastError || undefined,
      };
      scrapers.push(scraperHealth);

      if (metrics.status === ScraperStatus.RUNNING) {
        hasRunning = true;
      }

      if (metrics.healthStatus === HealthStatus.UNHEALTHY) {
        allHealthy = false;
      }
    });

    let summary: string;
    if (scrapers.length === 0) {
      summary = 'No scrapers registered';
    } else if (allHealthy && hasRunning) {
      summary = 'All scrapers healthy and running';
    } else if (allHealthy) {
      summary = 'All scrapers healthy (none running)';
    } else {
      const unhealthyCount = scrapers.filter(s => s.healthStatus === HealthStatus.UNHEALTHY).length;
      summary = `${unhealthyCount} scraper(s) unhealthy`;
    }

    return {
      healthy: allHealthy,
      timestamp: new Date(),
      scrapers,
      summary,
    };
  }

  /**
   * Get or create metrics for a source
   */
  private getOrCreateMetrics(source: string): ScraperMetrics {
    let metrics = this.metrics.get(source);
    if (!metrics) {
      metrics = createEmptyMetrics(source);
      this.metrics.set(source, metrics);
      this.requestTimestamps.set(source, []);
      this.responseTimesMs.set(source, []);
    }
    return metrics;
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearAll(): void {
    this.metrics.clear();
    this.requestTimestamps.clear();
    this.responseTimesMs.clear();
    this.logger.info('All metrics cleared');
  }
}

