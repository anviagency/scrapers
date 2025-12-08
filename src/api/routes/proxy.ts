import { Router, Request, Response } from 'express';
import type { Logger } from '../../utils/logger';
import { ProxyStatusTracker } from '../../monitoring/ProxyStatusTracker';

/**
 * Global proxy status tracker instance
 * This will be initialized in server.ts and passed here
 */
let proxyStatusTracker: ProxyStatusTracker | null = null;

/**
 * Sets the proxy status tracker instance
 */
export function setProxyStatusTracker(tracker: ProxyStatusTracker): void {
  proxyStatusTracker = tracker;
}

/**
 * Creates the proxy router
 */
export function createProxyRouter(logger: Logger): Router {
  const router = Router();

  /**
   * GET /api/proxy/status
   * Get detailed proxy status and statistics
   */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      if (!proxyStatusTracker) {
        res.json({
          success: true,
          data: {
            enabled: false,
            health: 'unknown',
            currentHost: '',
            currentPort: 0,
            rotationCount: 0,
            lastRotation: null,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            successRate: 0,
            averageResponseTimeMs: 0,
            lastValidation: null,
            validationResult: false,
            recentErrors: [],
            message: 'Proxy status tracker not initialized',
          },
        });
        return;
      }

      const status = proxyStatusTracker.getStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Failed to get proxy status', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get proxy status',
      });
    }
  });

  return router;
}

