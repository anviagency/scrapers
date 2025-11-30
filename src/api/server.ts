import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../database/Database';
import { DataExporter } from '../export/DataExporter';
import { swaggerSpec } from './swagger';

const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger('api-server');

// Initialize database
const dbPath = path.join(process.cwd(), 'data', 'alljobs.db');
const db = new DatabaseManager(dbPath, logger);

// Initialize data exporter
const outputDir = path.join(process.cwd(), 'output');
const exporter = new DataExporter(outputDir, logger);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AllJobs Scraper API Documentation',
}));

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: Get all job listings
 *     description: Retrieve job listings with optional filtering and pagination. Supports Hebrew text in all fields.
 *     tags: [Jobs]
 *     parameters:
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/OffsetParam'
 *       - $ref: '#/components/parameters/CompanyFilter'
 *       - $ref: '#/components/parameters/LocationFilter'
 *       - $ref: '#/components/parameters/JobTypeFilter'
 *       - $ref: '#/components/parameters/DateFromFilter'
 *       - $ref: '#/components/parameters/DateToFilter'
 *     responses:
 *       200:
 *         description: Successful response with job listings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobsResponse'
 *             example:
 *               success: true
 *               data:
 *                 - jobId: "8391177"
 *                   title: "דרוש /ה עו\"ד בתחום המיסוי המוניציפאלי"
 *                   company: "חברה חסויה"
 *                   description: "משרדנו מתמחה במשפט מנהלי..."
 *                   location: "תל אביב"
 *                   jobType: "משרה מלאה"
 *                   applicationUrl: "/Search/UploadSingle.aspx?JobID=8391177"
 *               pagination:
 *                 total: 540
 *                 limit: 10
 *                 offset: 0
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/jobs', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const company = req.query.company as string | undefined;
    const location = req.query.location as string | undefined;
    const jobType = req.query.jobType as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // Build filters object - only include defined values
    const filters: {
      limit?: number;
      offset?: number;
      company?: string;
      location?: string;
      jobType?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {};
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;
    if (company) filters.company = company;
    if (location) filters.location = location;
    if (jobType) filters.jobType = jobType;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const jobs = db.getJobs(Object.keys(filters).length > 0 ? filters : undefined);
    const total = db.getJobsCount(
      company || location || jobType || dateFrom || dateTo
        ? { company, location, jobType, dateFrom, dateTo }
        : undefined
    );

    res.json({
      success: true,
      data: jobs,
      pagination: {
        total,
        limit: limit || total,
        offset: offset || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get jobs', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve jobs',
    });
  }
});

/**
 * @swagger
 * /api/jobs/count:
 *   get:
 *     summary: Get total count of jobs
 *     description: Get the total number of jobs matching optional filters. Useful for pagination.
 *     tags: [Jobs]
 *     parameters:
 *       - $ref: '#/components/parameters/CompanyFilter'
 *       - $ref: '#/components/parameters/LocationFilter'
 *       - $ref: '#/components/parameters/JobTypeFilter'
 *       - $ref: '#/components/parameters/DateFromFilter'
 *       - $ref: '#/components/parameters/DateToFilter'
 *     responses:
 *       200:
 *         description: Successful response with job count
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CountResponse'
 *             example:
 *               success: true
 *               count: 540
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/jobs/count', (req, res) => {
  try {
    const company = req.query.company as string | undefined;
    const location = req.query.location as string | undefined;
    const jobType = req.query.jobType as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const count = db.getJobsCount({ company, location, jobType, dateFrom, dateTo });

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    logger.error('Failed to get jobs count', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve jobs count',
    });
  }
});

/**
 * @swagger
 * /api/jobs/export/csv:
 *   get:
 *     summary: Export jobs to CSV format
 *     description: |
 *       Export all jobs matching optional filters to CSV format and download the file.
 *       The CSV file includes UTF-8 BOM for Excel compatibility with Hebrew text.
 *       
 *       **Note:** This endpoint returns a file download, not JSON.
 *       
 *       **Filters:**
 *       - Leave all filters empty to export ALL jobs
 *       - Use dateFrom/dateTo to filter by scraping date
 *       - Combine multiple filters for precise results
 *     tags: [Export]
 *     parameters:
 *       - $ref: '#/components/parameters/CompanyFilter'
 *       - $ref: '#/components/parameters/LocationFilter'
 *       - $ref: '#/components/parameters/JobTypeFilter'
 *       - name: dateFrom
 *         in: query
 *         description: Filter jobs scraped from this date (YYYY-MM-DD format)
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-11-01"
 *       - name: dateTo
 *         in: query
 *         description: Filter jobs scraped until this date (YYYY-MM-DD format)
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-11-30"
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No jobs found to export
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "No jobs found to export"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/jobs/export/csv', async (req, res): Promise<void> => {
  try {
    const company = req.query.company as string | undefined;
    const location = req.query.location as string | undefined;
    const jobType = req.query.jobType as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // If no filters provided, get ALL jobs
    const filters = (company || location || jobType || dateFrom || dateTo)
      ? { company, location, jobType, dateFrom, dateTo }
      : undefined;

    // Get all jobs matching filters (no limit for export)
    const jobs = db.getJobs(filters);

    if (jobs.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No jobs found to export',
        message: filters
          ? 'No jobs match the provided filters. Try removing filters to export all jobs.'
          : 'No jobs found in database. Please run the scraper first.',
      });
      return;
    }

    // Export to CSV
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `alljobs-export-${timestamp}`;
    const csvPath = await exporter.exportToCsv(jobs, filename);

    // Send file
    res.download(csvPath, `alljobs-export-${timestamp}.csv`, (err) => {
      if (err) {
        logger.error('Failed to send CSV file', {
          error: err.message,
        });
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to download CSV file',
          });
        }
      }
    });
    return;
  } catch (error) {
    logger.error('Failed to export CSV', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to export CSV',
    });
  }
});

/**
 * @swagger
 * /api/jobs/export/json:
 *   get:
 *     summary: Export jobs to JSON format
 *     description: |
 *       Export all jobs matching optional filters to JSON format and download the file.
 *       The JSON file is formatted with 2-space indentation for readability.
 *       
 *       **Note:** This endpoint returns a file download, not JSON response.
 *     tags: [Export]
 *     parameters:
 *       - $ref: '#/components/parameters/CompanyFilter'
 *       - $ref: '#/components/parameters/LocationFilter'
 *       - $ref: '#/components/parameters/JobTypeFilter'
 *       - $ref: '#/components/parameters/DateFromFilter'
 *       - $ref: '#/components/parameters/DateToFilter'
 *     responses:
 *       200:
 *         description: JSON file download
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No jobs found to export
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "No jobs found to export"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/jobs/export/json', async (req, res): Promise<void> => {
  try {
    const company = req.query.company as string | undefined;
    const location = req.query.location as string | undefined;
    const jobType = req.query.jobType as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // If no filters provided, get ALL jobs
    const filters = (company || location || jobType || dateFrom || dateTo)
      ? { company, location, jobType, dateFrom, dateTo }
      : undefined;

    // Get all jobs matching filters
    const jobs = db.getJobs(filters);

    if (jobs.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No jobs found to export',
        message: filters
          ? 'No jobs match the provided filters. Try removing filters to export all jobs.'
          : 'No jobs found in database. Please run the scraper first.',
      });
      return;
    }

    // Export to JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `alljobs-export-${timestamp}`;
    const jsonPath = await exporter.exportToJson(jobs, filename);

    // Send file
    res.download(jsonPath, `alljobs-export-${timestamp}.json`, (err) => {
      if (err) {
        logger.error('Failed to send JSON file', {
          error: err.message,
        });
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to download JSON file',
          });
        }
      }
    });
    return;
  } catch (error) {
    logger.error('Failed to export JSON', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to export JSON',
    });
  }
});

/**
 * @swagger
 * /api/jobs/filters/options:
 *   get:
 *     summary: Get available filter options
 *     description: |
 *       Returns all unique values for companies, locations, and job types available in the database.
 *       Useful for building filter dropdowns or understanding what data is available.
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Available filter options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     companies:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of all unique company names
 *                     locations:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of all unique locations
 *                     jobTypes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of all unique job types
 *             example:
 *               success: true
 *               data:
 *                 companies: ["חברה א", "חברה ב", "TechTalent"]
 *                 locations: ["תל אביב", "ירושלים", "Haifa", "Tel Aviv"]
 *                 jobTypes: ["משרה מלאה", "משרה חלקית", "משמרות"]
 *       500:
 *         description: Internal server error
 */
app.get('/api/jobs/filters/options', (_req, res) => {
  try {
    // Get all jobs to extract unique values
    const allJobs = db.getJobs();
    
    const companies = [...new Set(allJobs.map(job => job.company).filter(Boolean))].sort();
    const locations = [...new Set(allJobs.map(job => job.location).filter(Boolean))].sort();
    const jobTypes = [...new Set(allJobs.map(job => job.jobType).filter(Boolean))].sort();

    res.json({
      success: true,
      data: {
        companies,
        locations,
        jobTypes,
        counts: {
          totalJobs: allJobs.length,
          uniqueCompanies: companies.length,
          uniqueLocations: locations.length,
          uniqueJobTypes: jobTypes.length,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get filter options', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve filter options',
    });
  }
});

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Get dashboard data
 *     description: |
 *       Returns comprehensive dashboard data including:
 *       - Last scraping session information
 *       - Total statistics
 *       - Recent scraping history
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     lastScraping:
 *                       type: object
 *                       nullable: true
 *                     totalJobs:
 *                       type: number
 *                     totalCompanies:
 *                       type: number
 *                     totalLocations:
 *                       type: number
 *                     recentSessions:
 *                       type: array
 */
app.get('/api/dashboard', (_req, res) => {
  try {
    const totalJobs = db.getJobsCount();
    const allJobs = db.getJobs();
    const companies = [...new Set(allJobs.map(job => job.company).filter(Boolean))];
    const locations = [...new Set(allJobs.map(job => job.location).filter(Boolean))];
    
    const lastScraping = db.getLastScrapingSession();
    const recentSessions = db.getScrapingSessions(5);

    res.json({
      success: true,
      data: {
        lastScraping,
        totalJobs,
        totalCompanies: companies.length,
        totalLocations: locations.length,
        recentSessions,
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
 *     summary: Get statistics about scraped jobs
 *     description: |
 *       Retrieve comprehensive statistics about the scraped job listings including:
 *       - Total number of jobs
 *       - Number of unique companies
 *       - Number of unique locations
 *       - Jobs grouped by job type
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Successful response with statistics
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/stats', (_req, res) => {
  try {
    const totalJobs = db.getJobsCount();

    // Get unique companies count
    const companiesStmt = db.getDb().prepare('SELECT COUNT(DISTINCT company) as count FROM jobs');
    const companiesResult = companiesStmt.get() as { count: number };

    // Get unique locations count
    const locationsStmt = db.getDb().prepare('SELECT COUNT(DISTINCT location) as count FROM jobs');
    const locationsResult = locationsStmt.get() as { count: number };

    // Get jobs by type
    const jobTypesStmt = db.getDb().prepare(
      'SELECT job_type, COUNT(*) as count FROM jobs GROUP BY job_type'
    );
    const jobTypes = jobTypesStmt.all() as Array<{ job_type: string; count: number }>;

    res.json({
      success: true,
      data: {
        totalJobs,
        uniqueCompanies: companiesResult.count,
        uniqueLocations: locationsResult.count,
        jobsByType: jobTypes.reduce((acc, item) => {
          acc[item.job_type] = item.count;
          return acc;
        }, {} as Record<string, number>),
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
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API server is running and responsive. Returns current server timestamp.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
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
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down API server');
  db.close();
  process.exit(0);
});

