import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '../utils/logger';
// DatabaseManager removed - using source-specific databases instead
import { AllJobsDatabaseManager } from '../database/alljobs/AllJobsDatabaseManager';
import { JobMasterDatabaseManager } from '../database/jobmaster/JobMasterDatabaseManager';
import { swaggerSpec } from './swagger';
import { createAllJobsRouter } from './routes/jobs/alljobs';
import { createJobMasterRouter } from './routes/jobs/jobmaster';
import { ScraperService } from './services/ScraperService';

const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger('api-server');

// Initialize databases
const allJobsDbPath = path.join(process.cwd(), 'data', 'alljobs.db');
const jobMasterDbPath = path.join(process.cwd(), 'data', 'jobmaster.db');
const allJobsDb = new AllJobsDatabaseManager(allJobsDbPath, logger);
const jobMasterDb = new JobMasterDatabaseManager(jobMasterDbPath, logger);

// Initialize scraper service
const scraperService = new ScraperService(logger);

// Legacy database removed - using source-specific databases instead

// Output directory for exports (used by route handlers)
const outputDir = path.join(process.cwd(), 'output');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));
logger.info('Serving static files from', { publicDir });

// Dashboard route
app.get('/dashboard', (_req, res) => {
  const dashboardPath = path.join(publicDir, 'dashboard.html');
  const absolutePath = path.resolve(dashboardPath);
  
  if (!fs.existsSync(absolutePath)) {
    logger.error('Dashboard file not found', { absolutePath, publicDir });
    res.status(404).json({ error: 'Dashboard file not found', path: absolutePath });
    return;
  }
  
  res.sendFile(absolutePath);
});

app.get('/dashboard.html', (_req, res) => {
  const dashboardPath = path.join(publicDir, 'dashboard.html');
  const absolutePath = path.resolve(dashboardPath);
  
  if (!fs.existsSync(absolutePath)) {
    logger.error('Dashboard file not found', { absolutePath, publicDir });
    res.status(404).json({ error: 'Dashboard file not found', path: absolutePath });
    return;
  }
  
  res.sendFile(absolutePath);
});

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Multi-Source Job Scraper API Documentation',
}));

// Mount source-specific routes
app.use('/api/jobs/alljobs', createAllJobsRouter(logger, outputDir));
app.use('/api/jobs/jobmaster', createJobMasterRouter(logger, outputDir));

// Legacy routes (backward compatibility - redirect to alljobs)
app.get('/api/jobs', (req, res) => {
  res.redirect(`/api/jobs/alljobs${req.url.includes('?') ? req.url.split('?')[1] : ''}`);
});
app.get('/api/jobs/count', (req, res) => {
  res.redirect(`/api/jobs/alljobs/count${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
});
app.get('/api/jobs/export/csv', (req, res) => {
  res.redirect(`/api/jobs/alljobs/export/csv${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
});
app.get('/api/jobs/export/json', (req, res) => {
  res.redirect(`/api/jobs/alljobs/export/json${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
});
app.get('/api/jobs/filters/options', (_req, res) => {
  res.redirect('/api/jobs/alljobs/filters/options');
});

// Old routes removed - using redirects above for backward compatibility
// Swagger documentation for legacy routes is maintained in swagger.ts

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     description: |
 *       Returns comprehensive dashboard data including statistics from all platforms and scraping session information.
 *       
 *       **Response Structure:**
 *       - \`stats\`: Combined statistics from all platforms
 *       - \`alljobs\`: AllJobs platform-specific statistics and sessions
 *       - \`jobmaster\`: JobMaster platform-specific statistics and sessions
 *       
 *       **Use Cases:**
 *       - Display overview dashboard
 *       - Monitor scraping activity
 *       - Track data growth per platform
 *       - View recent scraping sessions
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Dashboard data with platform-specific statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardResponse'
 *             example:
 *               success: true
 *               data:
 *                 stats:
 *                   totalJobs: 540
 *                   uniqueCompanies: 120
 *                   uniqueLocations: 45
 *                   uniqueJobTypes: 3
 *                 alljobs:
 *                   totalJobs: 400
 *                   uniqueCompanies: 100
 *                   uniqueLocations: 35
 *                   uniqueJobTypes: 3
 *                   lastScrapingSession:
 *                     id: 1
 *                     startedAt: "2025-11-30 09:55:54"
 *                     completedAt: "2025-11-30 10:59:33"
 *                     pagesScraped: 1329
 *                     jobsFound: 30688
 *                     status: "completed"
 *                 jobmaster:
 *                   totalJobs: 140
 *                   uniqueCompanies: 50
 *                   uniqueLocations: 20
 *                   uniqueJobTypes: 2
 *                   lastScrapingSession: null
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/dashboard', (_req, res) => {
  try {
    // Get AllJobs stats
    const allJobsTotal = allJobsDb.getJobsCount();
    const allJobsList = allJobsDb.getJobs({ limit: 1000 }); // Get sample for unique counts
    const allJobsCompanies = [...new Set(allJobsList.map(job => job.company).filter(Boolean))];
    const allJobsLocations = [...new Set(allJobsList.map(job => job.location).filter(Boolean))];
    const allJobsJobTypes = [...new Set(allJobsList.map(job => job.jobType).filter(Boolean))];
    const allJobsLastScraping = allJobsDb.getLastScrapingSession();
    const allJobsSessions = allJobsDb.getScrapingSessions(5);

    // Get JobMaster stats
    const jobMasterTotal = jobMasterDb.getJobsCount();
    const jobMasterList = jobMasterDb.getJobs({ limit: 1000 }); // Get sample for unique counts
    const jobMasterCompanies = [...new Set(jobMasterList.map(job => job.company).filter(Boolean))];
    const jobMasterLocations = [...new Set(jobMasterList.map(job => job.location).filter(Boolean))];
    const jobMasterJobTypes = [...new Set(jobMasterList.map(job => job.jobType).filter(Boolean))];
    const jobMasterLastScraping = jobMasterDb.getLastScrapingSession();
    const jobMasterSessions = jobMasterDb.getScrapingSessions(5);

    // Combined stats
    const totalJobs = allJobsTotal + jobMasterTotal;
    const totalCompanies = new Set([...allJobsCompanies, ...jobMasterCompanies]).size;
    const totalLocations = new Set([...allJobsLocations, ...jobMasterLocations]).size;
    const totalJobTypes = new Set([...allJobsJobTypes, ...jobMasterJobTypes]).size;

    // Calculate additional statistics
    const allJobsToday = allJobsDb.getJobsCount({
      dateFrom: new Date().toISOString().split('T')[0],
    });
    const jobMasterToday = jobMasterDb.getJobsCount({
      dateFrom: new Date().toISOString().split('T')[0],
    });
    const totalToday = allJobsToday + jobMasterToday;

    // Get running sessions (get the most recent one)
    // Sessions are sorted by started_at DESC, so the first one is the most recent
    const allJobsRunningSessions = allJobsSessions.filter(s => s.status === 'running');
    const jobMasterRunningSessions = jobMasterSessions.filter(s => s.status === 'running');
    // Get the most recent running session (first in array, which is sorted by started_at DESC)
    const allJobsActiveSession = allJobsRunningSessions.length > 0 ? allJobsRunningSessions[0] : null;
    const jobMasterActiveSession = jobMasterRunningSessions.length > 0 ? jobMasterRunningSessions[0] : null;

    res.json({
      success: true,
      // Combined stats
      combined: {
        totalJobs,
        uniqueCompanies: totalCompanies,
        uniqueLocations: totalLocations,
        uniqueJobTypes: totalJobTypes,
        totalToday,
      },
      // AllJobs source
      alljobs: {
        totalJobs: allJobsTotal,
        uniqueCompanies: allJobsCompanies.length,
        uniqueLocations: allJobsLocations.length,
        uniqueJobTypes: allJobsJobTypes.length,
        totalToday: allJobsToday,
        lastScrapingSession: allJobsLastScraping,
        activeScrapingSession: allJobsActiveSession,
        scrapingSessions: allJobsSessions,
        totalSessions: allJobsSessions.length,
        completedSessions: allJobsSessions.filter(s => s.status === 'completed').length,
        failedSessions: allJobsSessions.filter(s => s.status === 'failed').length,
      },
      // JobMaster source
      jobmaster: {
        totalJobs: jobMasterTotal,
        uniqueCompanies: jobMasterCompanies.length,
        uniqueLocations: jobMasterLocations.length,
        uniqueJobTypes: jobMasterJobTypes.length,
        totalToday: jobMasterToday,
        lastScrapingSession: jobMasterLastScraping,
        activeScrapingSession: jobMasterActiveSession,
        scrapingSessions: jobMasterSessions,
        totalSessions: jobMasterSessions.length,
        completedSessions: jobMasterSessions.filter(s => s.status === 'completed').length,
        failedSessions: jobMasterSessions.filter(s => s.status === 'failed').length,
      },
    });
  } catch (error) {
    logger.error('Failed to get dashboard data', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data',
    });
  }
});

/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Get combined statistics from all platforms
 *     description: |
 *       Retrieve comprehensive statistics about scraped job listings from all platforms combined.
 *       
 *       **Statistics Included:**
 *       - Total number of jobs across all platforms
 *       - Number of unique companies (deduplicated across platforms)
 *       - Number of unique locations (deduplicated across platforms)
 *       - Jobs grouped by job type
 *       - Job count per platform
 *       
 *       **Use Cases:**
 *       - Display overall statistics
 *       - Compare data volume between platforms
 *       - Analyze job type distribution
 *       - Monitor data growth
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Successful response with combined statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatsResponse'
 *             example:
 *               success: true
 *               data:
 *                 totalJobs: 540
 *                 uniqueCompanies: 120
 *                 uniqueLocations: 45
 *                 jobsByType:
 *                   "משרה מלאה": 400
 *                   "משרה חלקית": 140
 *                 sources:
 *                   alljobs: 400
 *                   jobmaster: 140
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/stats', (_req, res) => {
  try {
    // Combined stats from both sources
    const allJobsTotal = allJobsDb.getJobsCount();
    const jobMasterTotal = jobMasterDb.getJobsCount();
    const totalJobs = allJobsTotal + jobMasterTotal;

    // Get unique companies count from both sources
    const allJobsList = allJobsDb.getJobs({ limit: 10000 });
    const jobMasterList = jobMasterDb.getJobs({ limit: 10000 });
    const allCompanies = new Set([...allJobsList.map((j: { company: string }) => j.company), ...jobMasterList.map((j: { company: string }) => j.company)]);
    const allLocations = new Set([...allJobsList.map((j: { location: string }) => j.location), ...jobMasterList.map((j: { location: string }) => j.location)]);
    
    // Get jobs by type
    const jobsByType: Record<string, number> = {};
    [...allJobsList, ...jobMasterList].forEach((job: { jobType: string }) => {
      jobsByType[job.jobType] = (jobsByType[job.jobType] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        totalJobs,
        uniqueCompanies: allCompanies.size,
        uniqueLocations: allLocations.size,
        jobsByType,
        sources: {
          alljobs: allJobsTotal,
          jobmaster: jobMasterTotal,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
    });
  }
});

/**
 * @swagger
 * /api/scrapers/all/start:
 *   post:
 *     summary: Start all scrapers
 *     description: Start both AllJobs and JobMaster scrapers simultaneously
 *     tags: [Scrapers]
 *     responses:
 *       200:
 *         description: All scrapers started successfully
 */
app.post('/api/scrapers/all/start', async (_req, res) => {
  try {
    const results = {
      alljobs: await scraperService.startScraper('alljobs'),
      jobmaster: await scraperService.startScraper('jobmaster'),
    };

    const allSuccess = results.alljobs.success && results.jobmaster.success;
    const statusCode = allSuccess ? 200 : 207; // 207 Multi-Status

    res.status(statusCode).json({
      success: allSuccess,
      results,
    });
  } catch (error) {
    logger.error('Failed to start all scrapers', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start all scrapers',
    });
  }
});

/**
 * @swagger
 * /api/scrapers/all/stop:
 *   post:
 *     summary: Stop all scrapers
 *     description: Stop both AllJobs and JobMaster scrapers
 *     tags: [Scrapers]
 *     responses:
 *       200:
 *         description: All scrapers stopped successfully
 */
app.post('/api/scrapers/all/stop', (_req, res) => {
  try {
    const results = {
      alljobs: scraperService.stopScraper('alljobs'),
      jobmaster: scraperService.stopScraper('jobmaster'),
    };

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    logger.error('Failed to stop all scrapers', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to stop all scrapers',
    });
  }
});

/**
 * @swagger
 * /api/scrapers/all/status:
 *   get:
 *     summary: Get status of all scrapers
 *     description: Get the current status of all scrapers
 *     tags: [Scrapers]
 *     responses:
 *       200:
 *         description: Status of all scrapers
 */
app.get('/api/scrapers/all/status', (_req, res) => {
  try {
    const allStatuses = scraperService.getAllScraperStatuses();
    const allJobsLastSession = allJobsDb.getLastScrapingSession();
    const jobMasterLastSession = jobMasterDb.getLastScrapingSession();

    res.json({
      success: true,
      data: {
        alljobs: {
          ...allStatuses.get('alljobs'),
          lastSession: allJobsLastSession,
        },
        jobmaster: {
          ...allStatuses.get('jobmaster'),
          lastSession: jobMasterLastSession,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get all scrapers status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get all scrapers status',
    });
  }
});

/**
 * @swagger
 * /api/scrapers/{source}/start:
 *   post:
 *     summary: Start a scraper manually
 *     description: |
 *       Start a scraper process for the specified source (alljobs or jobmaster).
 *       The scraper will run in the background and update the database incrementally.
 *     tags: [Scrapers]
 *     parameters:
 *       - name: source
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [alljobs, jobmaster]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxPages:
 *                 type: integer
 *               resumeFromPage:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Scraper started successfully
 *       400:
 *         description: Scraper already running
 *       500:
 *         description: Failed to start scraper
 */
app.post('/api/scrapers/:source/start', async (req, res) => {
  try {
    const { source } = req.params;
    if (source !== 'alljobs' && source !== 'jobmaster') {
      res.status(400).json({
        success: false,
        error: 'Invalid source. Must be "alljobs" or "jobmaster"',
      });
      return;
    }

    const { maxPages, resumeFromPage } = req.body;
    const result = await scraperService.startScraper(source as 'alljobs' | 'jobmaster', {
      maxPages: maxPages ? parseInt(String(maxPages), 10) : undefined,
      resumeFromPage: resumeFromPage ? parseInt(String(resumeFromPage), 10) : undefined,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Failed to start scraper', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start scraper',
    });
  }
});

/**
 * @swagger
 * /api/scrapers/{source}/stop:
 *   post:
 *     summary: Stop a running scraper
 *     description: Stop a currently running scraper process.
 *     tags: [Scrapers]
 *     parameters:
 *       - name: source
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [alljobs, jobmaster]
 *     responses:
 *       200:
 *         description: Scraper stopped successfully
 *       400:
 *         description: Scraper is not running
 */
app.post('/api/scrapers/:source/stop', (req, res) => {
  try {
    const { source } = req.params;
    if (source !== 'alljobs' && source !== 'jobmaster') {
      res.status(400).json({
        success: false,
        error: 'Invalid source. Must be "alljobs" or "jobmaster"',
      });
      return;
    }

    const result = scraperService.stopScraper(source as 'alljobs' | 'jobmaster');
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Failed to stop scraper', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to stop scraper',
    });
  }
});

/**
 * @swagger
 * /api/scrapers/{source}/status:
 *   get:
 *     summary: Get scraper status
 *     description: Get the current status of a scraper, including whether it's running and the last scraping session.
 *     tags: [Scrapers]
 *     parameters:
 *       - name: source
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [alljobs, jobmaster]
 *     responses:
 *       200:
 *         description: Scraper status
 */
app.get('/api/scrapers/:source/status', (req, res) => {
  try {
    const { source } = req.params;
    if (source !== 'alljobs' && source !== 'jobmaster') {
      res.status(400).json({
        success: false,
        error: 'Invalid source. Must be "alljobs" or "jobmaster"',
      });
      return;
    }

    const status = scraperService.getScraperStatus(source as 'alljobs' | 'jobmaster');
    const db = source === 'alljobs' ? allJobsDb : jobMasterDb;
    const lastSession = db.getLastScrapingSession();

    res.json({
      success: true,
      isRunning: status.isRunning,
      processId: status.processId,
      lastSession,
    });
  } catch (error) {
    logger.error('Failed to get scraper status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get scraper status',
    });
  }
});


/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: |
 *       Check if the API server is running and responsive.
 *       
 *       **Use Cases:**
 *       - Monitor server availability
 *       - Load balancer health checks
 *       - Automated monitoring systems
 *       - Verify API connectivity
 *       
 *       **Response:**
 *       - \`status\`: Always "ok" when server is running
 *       - \`timestamp\`: Current server time in ISO 8601 format
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy and responsive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               status: "ok"
 *               timestamp: "2025-11-30T08:30:00.000Z"
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API server started on port ${PORT}`, {
    port: PORT,
    endpoints: [
      'GET /api/jobs - Get jobs with filters',
      'GET /api/jobs/count - Get jobs count',
      'GET /api/jobs/export/csv - Download CSV export',
      'GET /api/jobs/export/json - Download JSON export',
      'GET /api/stats - Get statistics',
      'GET /health - Health check',
      'GET /api-docs - Swagger API documentation',
    ],
  });
  console.log(`\n🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📚 Swagger Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`📊 Available endpoints:`);
  console.log(`   GET http://localhost:${PORT}/api/jobs`);
  console.log(`   GET http://localhost:${PORT}/api/jobs/export/csv`);
  console.log(`   GET http://localhost:${PORT}/api/stats`);
  console.log(`   GET http://localhost:${PORT}/api-docs (Swagger UI)`);
  console.log(`\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down API server');
  allJobsDb.close();
  jobMasterDb.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down API server');
  allJobsDb.close();
  jobMasterDb.close();
  process.exit(0);
});

