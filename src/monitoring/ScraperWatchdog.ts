import type { Logger } from '../utils/logger';
import type { ScraperService } from '../api/services/ScraperService';
import { MetricsCollector } from './MetricsCollector';
import { HealthStatus } from './ScraperMetrics';

/**
 * Configuration for watchdog
 */
export interface WatchdogConfig {
  checkIntervalMs: number;        // How often to check scraper health (default: 60000 = 1 minute)
  maxIdleTimeMs: number;          // Max time with no activity before considering stuck (default: 300000 = 5 minutes)
  maxConsecutiveErrors: number;   // Max consecutive errors before considering unhealthy (default: 10)
  autoRestart: boolean;           // Whether to automatically restart failed scrapers (default: false)
  autoRestartDelayMs: number;     // Delay before auto-restart (default: 30000 = 30 seconds)
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WatchdogConfig = {
  checkIntervalMs: 60000,         // 1 minute
  maxIdleTimeMs: 300000,          // 5 minutes
  maxConsecutiveErrors: 10,
  autoRestart: false,
  autoRestartDelayMs: 30000,      // 30 seconds
};

/**
 * Watchdog check result
 */
export interface WatchdogCheckResult {
  timestamp: Date;
  checks: Array<{
    source: string;
    healthy: boolean;
    issue?: string;
    action?: string;
  }>;
  overallHealthy: boolean;
}

/**
 * ScraperWatchdog - Monitors scraper health and auto-recovers failed scrapers
 */
export class ScraperWatchdog {
  private readonly logger: Logger;
  private readonly scraperService: ScraperService;
  private readonly metricsCollector: MetricsCollector;
  private readonly config: WatchdogConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastCheckResult: WatchdogCheckResult | null = null;

  constructor(
    logger: Logger,
    scraperService: ScraperService,
    config: Partial<WatchdogConfig> = {}
  ) {
    this.logger = logger;
    this.scraperService = scraperService;
    this.metricsCollector = MetricsCollector.getInstance(logger);
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.logger.info('ScraperWatchdog initialized', { config: this.config });
  }

  /**
   * Start the watchdog
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Watchdog is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting ScraperWatchdog', {
      checkIntervalMs: this.config.checkIntervalMs,
      autoRestart: this.config.autoRestart,
    });

    // Run first check immediately
    this.runCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the watchdog
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.logger.info('ScraperWatchdog stopped');
  }

  /**
   * Run a single health check
   */
  async runCheck(): Promise<WatchdogCheckResult> {
    const checks: WatchdogCheckResult['checks'] = [];
    let overallHealthy = true;

    const sources: Array<'alljobs' | 'jobmaster' | 'madlan'> = ['alljobs', 'jobmaster', 'madlan'];

    for (const source of sources) {
      const checkResult = await this.checkScraper(source);
      checks.push(checkResult);
      
      if (!checkResult.healthy) {
        overallHealthy = false;
        
        // Log warning or error based on severity
        if (checkResult.issue?.includes('stuck') || checkResult.issue?.includes('too many errors')) {
          this.logger.error(`Watchdog detected issue with ${source}`, {
            issue: checkResult.issue,
            action: checkResult.action,
          });
        } else {
          this.logger.warn(`Watchdog detected issue with ${source}`, {
            issue: checkResult.issue,
            action: checkResult.action,
          });
        }
      }
    }

    const result: WatchdogCheckResult = {
      timestamp: new Date(),
      checks,
      overallHealthy,
    };

    this.lastCheckResult = result;

    if (overallHealthy) {
      this.logger.debug('Watchdog check completed - all scrapers healthy');
    } else {
      this.logger.warn('Watchdog check completed - issues detected', {
        unhealthyScrapers: checks.filter(c => !c.healthy).map(c => c.source),
      });
    }

    return result;
  }

  /**
   * Check a single scraper's health
   */
  private async checkScraper(source: 'alljobs' | 'jobmaster' | 'madlan'): Promise<{
    source: string;
    healthy: boolean;
    issue?: string;
    action?: string;
  }> {
    const status = this.scraperService.getScraperStatus(source);
    const metrics = this.metricsCollector.getMetrics(source);

    // If not running, it's technically "healthy" - just idle
    if (!status.isRunning) {
      return {
        source,
        healthy: true,
        issue: undefined,
        action: undefined,
      };
    }

    // Check for various issues
    const issues: string[] = [];
    let shouldRestart = false;

    // 1. Check for idle/stuck scraper
    if (metrics?.lastActivityTime) {
      const idleTimeMs = Date.now() - metrics.lastActivityTime.getTime();
      if (idleTimeMs > this.config.maxIdleTimeMs) {
        issues.push(`Scraper stuck - no activity for ${Math.round(idleTimeMs / 1000)}s`);
        shouldRestart = true;
      }
    }

    // 2. Check for too many consecutive errors
    if (metrics && metrics.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      issues.push(`Too many consecutive errors: ${metrics.consecutiveErrors}`);
      shouldRestart = true;
    }

    // 3. Check for unhealthy status
    if (metrics?.healthStatus === HealthStatus.UNHEALTHY) {
      issues.push('Scraper marked as unhealthy');
      shouldRestart = true;
    }

    // If no issues, scraper is healthy
    if (issues.length === 0) {
      return {
        source,
        healthy: true,
        issue: undefined,
        action: undefined,
      };
    }

    // Determine action
    let action: string | undefined;
    if (shouldRestart && this.config.autoRestart) {
      action = 'Auto-restarting scraper';
      await this.restartScraper(source);
    } else if (shouldRestart) {
      action = 'Restart recommended (auto-restart disabled)';
    } else {
      action = 'Monitoring';
    }

    return {
      source,
      healthy: false,
      issue: issues.join('; '),
      action,
    };
  }

  /**
   * Restart a scraper with delay
   */
  private async restartScraper(source: 'alljobs' | 'jobmaster' | 'madlan'): Promise<void> {
    this.logger.info(`Watchdog triggering restart for ${source}`, {
      delayMs: this.config.autoRestartDelayMs,
    });

    // Stop the scraper
    this.scraperService.stopScraper(source);

    // Wait before restarting
    await new Promise(resolve => setTimeout(resolve, this.config.autoRestartDelayMs));

    // Restart
    const result = await this.scraperService.startScraper(source);
    
    if (result.success) {
      this.logger.info(`Watchdog successfully restarted ${source}`);
    } else {
      this.logger.error(`Watchdog failed to restart ${source}`, {
        error: result.message,
      });
    }
  }

  /**
   * Get the last check result
   */
  getLastCheckResult(): WatchdogCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * Check if watchdog is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart)
   */
  updateConfig(config: Partial<WatchdogConfig>): void {
    Object.assign(this.config, config);
    this.logger.info('Watchdog configuration updated', { config: this.config });
    
    // Restart if running to apply new interval
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

