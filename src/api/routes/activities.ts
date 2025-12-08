import { Router, Request, Response } from 'express';
import type { Logger } from '../../utils/logger';
import { ActivityLogger } from '../../monitoring/ActivityLogger';
import { ActivityDatabase } from '../../monitoring/ActivityDatabase';
import type { ActivitySource, ActivityType, ActivityStatus } from '../../monitoring/ActivityLogger';

/**
 * Creates the activities router
 */
export function createActivitiesRouter(logger: Logger): Router {
  const router = Router();

  // Initialize ActivityLogger singleton (creates database connection)
  ActivityLogger.getInstance(logger);
  
  // Also create ActivityDatabase instance for direct access
  const activityDb = new ActivityDatabase(logger);

  /**
   * GET /api/activities
   * Get activity log with optional filtering and pagination
   * Query params:
   *   - source: alljobs | jobmaster | madlan
   *   - type: http_request | parsing | database | error | proxy
   *   - status: success | error | warning | retry
   *   - limit: number (default: 100)
   *   - offset: number (default: 0)
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const source = req.query.source as ActivitySource | undefined;
      const type = req.query.type as ActivityType | undefined;
      const status = req.query.status as ActivityStatus | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      // Validate source if provided
      if (source && !['alljobs', 'jobmaster', 'madlan', 'carwiz', 'freesbe'].includes(source)) {
        res.status(400).json({
          success: false,
          error: 'Invalid source. Must be one of: alljobs, jobmaster, madlan, carwiz, freesbe',
        });
        return;
      }

      // Validate type if provided
      if (type && !['http_request', 'parsing', 'database', 'error', 'proxy'].includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid type. Must be one of: http_request, parsing, database, error, proxy',
        });
        return;
      }

      // Validate status if provided
      if (status && !['success', 'error', 'warning', 'retry'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status. Must be one of: success, error, warning, retry',
        });
        return;
      }

      const activities = activityDb.getActivities({
        source,
        type,
        status,
        limit,
        offset,
      });

      const totalCount = activityDb.getActivityCount({ source, type, status });

      res.json({
        success: true,
        data: {
          activities,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get activities', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get activities',
      });
    }
  });

  /**
   * GET /api/activities/stats
   * Get activity statistics
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const allActivities = activityDb.getActivities({ limit: 1000 });

      // Calculate statistics
      const stats = {
        total: allActivities.length,
        bySource: {
          alljobs: allActivities.filter((a) => a.source === 'alljobs').length,
          jobmaster: allActivities.filter((a) => a.source === 'jobmaster').length,
          madlan: allActivities.filter((a) => a.source === 'madlan').length,
          carwiz: allActivities.filter((a) => a.source === 'carwiz').length,
          freesbe: allActivities.filter((a) => a.source === 'freesbe').length,
        },
        byType: {
          http_request: allActivities.filter((a) => a.type === 'http_request').length,
          parsing: allActivities.filter((a) => a.type === 'parsing').length,
          database: allActivities.filter((a) => a.type === 'database').length,
          error: allActivities.filter((a) => a.type === 'error').length,
          proxy: allActivities.filter((a) => a.type === 'proxy').length,
        },
        byStatus: {
          success: allActivities.filter((a) => a.status === 'success').length,
          error: allActivities.filter((a) => a.status === 'error').length,
          warning: allActivities.filter((a) => a.status === 'warning').length,
          retry: allActivities.filter((a) => a.status === 'retry').length,
        },
        recentErrors: allActivities
          .filter((a) => a.status === 'error')
          .slice(0, 10)
          .map((a) => ({
            timestamp: a.timestamp,
            source: a.source,
            message: a.message,
            error: a.details.error,
          })),
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get activity stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get activity stats',
      });
    }
  });

  return router;
}

