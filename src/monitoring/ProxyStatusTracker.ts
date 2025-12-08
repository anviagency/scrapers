import type { Logger } from '../utils/logger';

/**
 * Proxy health status
 */
export type ProxyHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Proxy error entry
 */
export interface ProxyError {
  timestamp: Date;
  error: string;
  url?: string;
}

/**
 * Proxy status information
 */
export interface ProxyStatus {
  enabled: boolean;
  health: ProxyHealth;
  currentHost: string;
  currentPort: number;
  rotationCount: number;
  lastRotation: Date | null;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTimeMs: number;
  lastValidation: Date | null;
  validationResult: boolean;
  recentErrors: ProxyError[];
}

/**
 * ProxyStatusTracker - Tracks proxy health, rotation, errors, and statistics
 */
export class ProxyStatusTracker {
  private readonly logger: Logger;
  private enabled: boolean = false;
  private currentHost: string = '';
  private currentPort: number = 0;
  private rotationCount: number = 0;
  private lastRotation: Date | null = null;
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private responseTimes: number[] = [];
  private readonly maxResponseTimes: number = 100;
  private lastValidation: Date | null = null;
  private validationResult: boolean = false;
  private readonly recentErrors: ProxyError[] = [];
  private readonly maxErrors: number = 50;

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.info('ProxyStatusTracker initialized');
  }

  /**
   * Set proxy enabled/disabled status
   */
  public setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;

    if (!wasEnabled && enabled) {
      this.logger.info('Proxy enabled');
    } else if (wasEnabled && !enabled) {
      this.logger.info('Proxy disabled');
    }
  }

  /**
   * Set proxy configuration
   */
  public setProxyConfig(host: string, port: number, enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    this.currentHost = host;
    this.currentPort = port;

    if (!wasEnabled && enabled) {
      this.logger.info('Proxy enabled', { host, port });
    } else if (wasEnabled && !enabled) {
      this.logger.info('Proxy disabled');
    }
  }

  /**
   * Record a proxy request
   */
  public recordProxyRequest(success: boolean, responseTimeMs: number): void {
    if (!this.enabled) {
      return;
    }

    this.totalRequests++;
    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }

    // Store response time
    this.responseTimes.push(responseTimeMs);
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }

    this.logger.debug('Proxy request recorded', {
      success,
      responseTimeMs,
      successRate: this.getSuccessRate(),
    });
  }

  /**
   * Record a proxy error
   */
  public recordProxyError(error: string, url?: string): void {
    if (!this.enabled) {
      return;
    }

    const proxyError: ProxyError = {
      timestamp: new Date(),
      error,
      url,
    };

    this.recentErrors.push(proxyError);
    if (this.recentErrors.length > this.maxErrors) {
      this.recentErrors.shift();
    }

    this.failedRequests++;
    this.totalRequests++;

    this.logger.warn('Proxy error recorded', { error, url });
  }

  /**
   * Record proxy rotation
   */
  public recordRotation(newHost: string, newPort: number): void {
    if (!this.enabled) {
      return;
    }

    this.rotationCount++;
    this.lastRotation = new Date();
    this.currentHost = newHost;
    this.currentPort = newPort;

    this.logger.info('Proxy rotation recorded', {
      rotationCount: this.rotationCount,
      newHost,
      newPort,
    });
  }

  /**
   * Record proxy validation result
   */
  public recordValidation(result: boolean): void {
    this.lastValidation = new Date();
    this.validationResult = result;

    this.logger.debug('Proxy validation recorded', { result });
  }

  /**
   * Get current proxy status
   */
  public getStatus(): ProxyStatus {
    return {
      enabled: this.enabled,
      health: this.calculateHealth(),
      currentHost: this.currentHost,
      currentPort: this.currentPort,
      rotationCount: this.rotationCount,
      lastRotation: this.lastRotation,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      successRate: this.getSuccessRate(),
      averageResponseTimeMs: this.getAverageResponseTime(),
      lastValidation: this.lastValidation,
      validationResult: this.validationResult,
      recentErrors: [...this.recentErrors].reverse(), // Most recent first
    };
  }

  /**
   * Reset all statistics
   */
  public reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.responseTimes = [];
    this.recentErrors.length = 0;
    this.rotationCount = 0;
    this.lastRotation = null;
    this.logger.info('Proxy statistics reset');
  }

  /**
   * Calculate success rate percentage
   */
  private getSuccessRate(): number {
    if (this.totalRequests === 0) {
      return 100;
    }
    return Math.round((this.successfulRequests / this.totalRequests) * 100);
  }

  /**
   * Calculate average response time
   */
  private getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) {
      return 0;
    }
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.responseTimes.length);
  }

  /**
   * Calculate proxy health status
   */
  private calculateHealth(): ProxyHealth {
    if (!this.enabled) {
      return 'unknown';
    }

    if (this.totalRequests === 0) {
      return 'unknown';
    }

    const successRate = this.getSuccessRate();

    if (successRate >= 95) {
      return 'healthy';
    } else if (successRate >= 70) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }
}

