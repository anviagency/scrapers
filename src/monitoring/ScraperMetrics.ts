/**
 * Scraper Metrics Types and Interfaces
 * Provides real-time monitoring and health tracking for all scrapers
 */

/**
 * Scraper status enumeration
 */
export enum ScraperStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error',
  COMPLETED = 'completed',
}

/**
 * Health status based on error rate and performance
 */
export enum HealthStatus {
  HEALTHY = 'healthy',     // < 5% error rate
  DEGRADED = 'degraded',   // 5-20% error rate
  UNHEALTHY = 'unhealthy', // > 20% error rate
  UNKNOWN = 'unknown',     // No data
}

/**
 * Detailed metrics for a single scraper
 */
export interface ScraperMetrics {
  source: string;
  status: ScraperStatus;
  healthStatus: HealthStatus;
  
  // Timing
  startTime: Date | null;
  lastActivityTime: Date | null;
  
  // Progress
  currentCategory: string;
  currentPage: number;
  totalPagesScraped: number;
  
  // Results
  itemsFound: number;
  itemsSaved: number;
  duplicatesSkipped: number;
  
  // Errors
  totalErrors: number;
  consecutiveErrors: number;
  lastError: string | null;
  lastErrorTime: Date | null;
  
  // Performance
  requestsTotal: number;
  requestsPerMinute: number;
  averageResponseTimeMs: number;
  
  // Database
  totalItemsInDatabase: number;
}

/**
 * Aggregated metrics across all scrapers
 */
export interface AggregatedMetrics {
  timestamp: Date;
  totalScrapers: number;
  activeScrapers: number;
  healthyScrapers: number;
  degradedScrapers: number;
  unhealthyScrapers: number;
  
  totalItemsFound: number;
  totalItemsSaved: number;
  totalErrors: number;
  totalRequestsPerMinute: number;
  
  scrapers: Record<string, ScraperMetrics>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  timestamp: Date;
  scrapers: Array<{
    source: string;
    status: ScraperStatus;
    healthStatus: HealthStatus;
    lastActivityTime: Date | null;
    error?: string;
  }>;
  summary: string;
}

/**
 * Creates an empty ScraperMetrics object with defaults
 */
export function createEmptyMetrics(source: string): ScraperMetrics {
  return {
    source,
    status: ScraperStatus.IDLE,
    healthStatus: HealthStatus.UNKNOWN,
    startTime: null,
    lastActivityTime: null,
    currentCategory: '',
    currentPage: 0,
    totalPagesScraped: 0,
    itemsFound: 0,
    itemsSaved: 0,
    duplicatesSkipped: 0,
    totalErrors: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastErrorTime: null,
    requestsTotal: 0,
    requestsPerMinute: 0,
    averageResponseTimeMs: 0,
    totalItemsInDatabase: 0,
  };
}

/**
 * Calculates health status based on error rate
 */
export function calculateHealthStatus(
  totalRequests: number,
  totalErrors: number,
  consecutiveErrors: number
): HealthStatus {
  if (totalRequests === 0) {
    return HealthStatus.UNKNOWN;
  }

  // If too many consecutive errors, always unhealthy
  if (consecutiveErrors >= 10) {
    return HealthStatus.UNHEALTHY;
  }

  const errorRate = totalErrors / totalRequests;

  if (errorRate < 0.05) {
    return HealthStatus.HEALTHY;
  } else if (errorRate < 0.20) {
    return HealthStatus.DEGRADED;
  } else {
    return HealthStatus.UNHEALTHY;
  }
}

