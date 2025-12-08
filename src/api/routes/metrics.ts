import { Router, Request, Response } from 'express';
import type { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/MetricsCollector';
import type { AllJobsDatabaseManager } from '../../database/alljobs/AllJobsDatabaseManager';
import type { JobMasterDatabaseManager } from '../../database/jobmaster/JobMasterDatabaseManager';
import type { MadlanDatabaseManager } from '../../database/madlan/MadlanDatabaseManager';
import type { CarWizDatabaseManager } from '../../database/carwiz/CarWizDatabaseManager';
import type { FreesbeDatabaseManager } from '../../database/freesbe/FreesbeDatabaseManager';

/**
 * Creates the metrics router
 */
export function createMetricsRouter(
  logger: Logger,
  alljobsDb: AllJobsDatabaseManager,
  jobmasterDb: JobMasterDatabaseManager,
  madlanDb: MadlanDatabaseManager,
  carwizDb: CarWizDatabaseManager,
  freesbeDb: FreesbeDatabaseManager
): Router {
  const router = Router();

  // Initialize metrics collector
  let metricsCollector: MetricsCollector;
  try {
    metricsCollector = MetricsCollector.getInstance(logger);
    metricsCollector.initializeScraper('alljobs');
    metricsCollector.initializeScraper('jobmaster');
    metricsCollector.initializeScraper('madlan');
    metricsCollector.initializeScraper('carwiz');
    metricsCollector.initializeScraper('freesbe');
  } catch {
    metricsCollector = MetricsCollector.getInstance();
  }

  /**
   * GET /api/metrics
   * Get all scraper metrics
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      // Update database counts before returning metrics
      metricsCollector.updateDatabaseCount('alljobs', alljobsDb.getJobsCount());
      metricsCollector.updateDatabaseCount('jobmaster', jobmasterDb.getJobsCount());
      metricsCollector.updateDatabaseCount('madlan', madlanDb.getListingsCount());
      metricsCollector.updateDatabaseCount('carwiz', carwizDb.getListingsCount());
      metricsCollector.updateDatabaseCount('freesbe', freesbeDb.getListingsCount());

      const metrics = metricsCollector.getAllMetrics();
      
      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get metrics',
      });
    }
  });

  /**
   * GET /api/metrics/health
   * Get health check for all scrapers
   * IMPORTANT: This route must be defined BEFORE /:source
   */
  router.get('/health', (_req: Request, res: Response) => {
    try {
      const healthCheck = metricsCollector.getHealthCheck();
      
      res.status(healthCheck.healthy ? 200 : 503).json({
        success: healthCheck.healthy,
        data: healthCheck,
      });
    } catch (error) {
      logger.error('Failed to perform health check', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to perform health check',
      });
    }
  });

  /**
   * GET /api/metrics/summary
   * Get a brief summary of all scrapers
   * IMPORTANT: This route must be defined BEFORE /:source
   */
  router.get('/summary', (_req: Request, res: Response) => {
    try {
      // Update all database counts
      metricsCollector.updateDatabaseCount('alljobs', alljobsDb.getJobsCount());
      metricsCollector.updateDatabaseCount('jobmaster', jobmasterDb.getJobsCount());
      metricsCollector.updateDatabaseCount('madlan', madlanDb.getListingsCount());
      metricsCollector.updateDatabaseCount('carwiz', carwizDb.getListingsCount());
      metricsCollector.updateDatabaseCount('freesbe', freesbeDb.getListingsCount());

      const allMetrics = metricsCollector.getAllMetrics();
      
        const summary = {
        timestamp: allMetrics.timestamp,
        scrapers: Object.values(allMetrics.scrapers).map(m => ({
          source: m.source,
          status: m.status,
          health: m.healthStatus,
          currentCategory: m.currentCategory,
          currentPage: m.currentPage,
          itemsInDb: m.totalItemsInDatabase,
          requestsPerMinute: m.requestsPerMinute,
          errors: m.totalErrors,
          lastError: m.lastError,
          lastActivityTime: m.lastActivityTime,
        })),
        totals: {
          activeScrapers: allMetrics.activeScrapers,
          totalItems: allMetrics.totalItemsSaved,
          totalRPM: allMetrics.totalRequestsPerMinute,
          totalErrors: allMetrics.totalErrors,
        },
      };

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Failed to get metrics summary', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get metrics summary',
      });
    }
  });

  /**
   * GET /api/metrics/:source
   * Get metrics for a specific scraper
   * IMPORTANT: This route must be defined AFTER /health and /summary
   */
  router.get('/:source', (req: Request, res: Response) => {
    try {
      const { source } = req.params;
      
      if (!['alljobs', 'jobmaster', 'madlan', 'carwiz', 'freesbe'].includes(source)) {
        res.status(400).json({
          success: false,
          error: 'Invalid source. Must be one of: alljobs, jobmaster, madlan, carwiz, freesbe',
        });
        return;
      }

      // Update database count for this source
      if (source === 'alljobs') {
        metricsCollector.updateDatabaseCount(source, alljobsDb.getJobsCount());
      } else if (source === 'jobmaster') {
        metricsCollector.updateDatabaseCount(source, jobmasterDb.getJobsCount());
      } else if (source === 'madlan') {
        metricsCollector.updateDatabaseCount(source, madlanDb.getListingsCount());
      } else if (source === 'carwiz') {
        metricsCollector.updateDatabaseCount(source, carwizDb.getListingsCount());
      } else if (source === 'freesbe') {
        metricsCollector.updateDatabaseCount(source, freesbeDb.getListingsCount());
      }

      const metrics = metricsCollector.getMetrics(source);
      
      if (!metrics) {
        res.status(404).json({
          success: false,
          error: `No metrics found for source: ${source}`,
        });
        return;
      }

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get metrics for source', {
        error: error instanceof Error ? error.message : String(error),
        source: req.params.source,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get metrics',
      });
    }
  });

  return router;
}
