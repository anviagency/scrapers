import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import type { Logger } from '../../utils/logger';

export interface ScraperStatus {
  source: 'alljobs' | 'jobmaster';
  isRunning: boolean;
  processId?: number;
  startedAt?: Date;
}

/**
 * Service for managing scraper processes
 * Handles starting, stopping, and monitoring scrapers
 */
export class ScraperService {
  private runningScrapers: Map<string, ChildProcess> = new Map();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start a scraper process
   * @param source - Scraper source ('alljobs' or 'jobmaster')
   * @param options - Scraping options
   * @returns Promise that resolves when scraper starts
   */
  async startScraper(
    source: 'alljobs' | 'jobmaster',
    options?: {
      maxPages?: number;
      resumeFromPage?: number;
    }
  ): Promise<{ success: boolean; message: string; processId?: number }> {
    if (this.runningScrapers.has(source)) {
      return {
        success: false,
        message: `Scraper ${source} is already running`,
      };
    }

    try {
      // Use compiled JavaScript from dist folder
      const scriptPath =
        source === 'alljobs'
          ? path.join(process.cwd(), 'dist', 'index.js')
          : path.join(process.cwd(), 'dist', 'scrapers', 'jobmaster', 'index.js');

      // Set environment variables for options instead of command line args
      // (since the scrapers read from env vars)
      const env = { ...process.env };
      if (options?.maxPages) {
        if (source === 'alljobs') {
          env.MAX_PAGES = String(options.maxPages);
        } else {
          env.JOBMASTER_MAX_PAGES = String(options.maxPages);
        }
      }
      if (options?.resumeFromPage) {
        env.RESUME_FROM_PAGE = String(options.resumeFromPage);
      }

      // Verify script exists
      const fs = require('fs');
      if (!fs.existsSync(scriptPath)) {
        this.logger.error(`Script not found: ${scriptPath}`);
        return {
          success: false,
          message: `Script not found: ${scriptPath}. Please run 'npm run build' first.`,
        };
      }

      // Use node to run compiled JavaScript
      this.logger.info(`Starting scraper ${source}`, { scriptPath, cwd: process.cwd() });
      const childProcess = spawn('node', [scriptPath], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env,
      });

      // Store process
      this.runningScrapers.set(source, childProcess);

      // Handle process events
      childProcess.on('exit', (code) => {
        this.logger.info(`Scraper ${source} exited`, { code });
        this.runningScrapers.delete(source);
      });

      childProcess.on('error', (error) => {
        this.logger.error(`Scraper ${source} error`, {
          error: error.message,
        });
        this.runningScrapers.delete(source);
      });

      // Log output
      childProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.logger.info(`Scraper ${source} stdout`, {
          output: output.trim(),
        });
        console.log(`[${source}] ${output.trim()}`);
      });

      childProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        this.logger.error(`Scraper ${source} stderr`, {
          output: output.trim(),
        });
        console.error(`[${source}] ERROR: ${output.trim()}`);
      });

      this.logger.info(`Started scraper ${source}`, {
        processId: childProcess.pid,
      });

      return {
        success: true,
        message: `Scraper ${source} started successfully`,
        processId: childProcess.pid,
      };
    } catch (error) {
      this.logger.error(`Failed to start scraper ${source}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to start scraper: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Stop a running scraper
   * @param source - Scraper source
   * @returns Success status
   */
  stopScraper(source: 'alljobs' | 'jobmaster'): { success: boolean; message: string } {
    const process = this.runningScrapers.get(source);
    if (!process) {
      return {
        success: false,
        message: `Scraper ${source} is not running`,
      };
    }

    try {
      process.kill('SIGTERM');
      this.runningScrapers.delete(source);
      this.logger.info(`Stopped scraper ${source}`);
      return {
        success: true,
        message: `Scraper ${source} stopped successfully`,
      };
    } catch (error) {
      this.logger.error(`Failed to stop scraper ${source}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to stop scraper: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get status of a scraper
   * @param source - Scraper source
   * @returns Scraper status
   */
  getScraperStatus(source: 'alljobs' | 'jobmaster'): ScraperStatus {
    const process = this.runningScrapers.get(source);
    return {
      source,
      isRunning: !!process,
      processId: process?.pid,
      startedAt: process ? new Date() : undefined, // Note: We don't track start time currently
    };
  }

  /**
   * Get status of all scrapers
   * @returns Map of scraper statuses
   */
  getAllScraperStatuses(): Map<string, ScraperStatus> {
    const statuses = new Map<string, ScraperStatus>();
    statuses.set('alljobs', this.getScraperStatus('alljobs'));
    statuses.set('jobmaster', this.getScraperStatus('jobmaster'));
    return statuses;
  }
}

