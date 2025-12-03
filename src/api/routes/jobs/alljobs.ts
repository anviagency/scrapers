import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../../../utils/logger';
import { AllJobsDatabaseManager } from '../../../database/alljobs/AllJobsDatabaseManager';
import { DataExporter } from '../../../export/DataExporter';

/**
 * Creates router for AllJobs API endpoints
 * @param logger - Logger instance
 * @param outputDir - Output directory for exports
 * @returns Express router
 */
export function createAllJobsRouter(logger: Logger, outputDir: string): Router {
  const router = Router();
  const dbPath = path.join(process.cwd(), 'data', 'alljobs.db');
  const db = new AllJobsDatabaseManager(dbPath, logger);
  const exporter = new DataExporter(outputDir, logger);

  /**
   * @swagger
   * /api/jobs/alljobs:
   *   get:
   *     summary: Get AllJobs job listings
   *     description: |
   *       Retrieve job listings from AllJobs platform (alljobs.co.il) with advanced filtering and pagination.
   *       
   *       **Features:**
   *       - Filter by company, location, job type, or date range
   *       - Pagination support with limit and offset
   *       - Case-insensitive partial matching for company and location
   *       - Automatic Hebrew/English location mapping
   *       - Full UTF-8 support for Hebrew text
   *       
   *       **Example Usage:**
   *       - Get first 10 jobs: `/api/jobs/alljobs?limit=10`
   *       - Filter by location: `/api/jobs/alljobs?location=תל אביב`
   *       - Filter by date range: `/api/jobs/alljobs?dateFrom=2025-11-01&dateTo=2025-11-30`
   *     tags: [AllJobs]
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
   *             examples:
   *               default:
   *                 $ref: '#/components/examples/JobsResponseExample'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: "Failed to retrieve jobs"
   */
  router.get('/', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const company = req.query.company as string | undefined;
      const location = req.query.location as string | undefined;
      const jobType = req.query.jobType as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const filters = {
        limit,
        offset,
        company,
        location,
        jobType,
        dateFrom,
        dateTo,
      };

      const jobs = db.getJobs(filters);
      const total = db.getJobsCount({ company, location, jobType, dateFrom, dateTo });

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
      logger.error('Failed to get AllJobs jobs', {
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
   * /api/jobs/alljobs/count:
   *   get:
   *     summary: Get AllJobs job count
   *     description: |
   *       Get the total number of AllJobs jobs matching optional filters.
   *       Useful for pagination and understanding dataset size.
   *       
   *       **Use Cases:**
   *       - Calculate total pages for pagination
   *       - Display job count in UI
   *       - Validate filter results before fetching data
   *     tags: [AllJobs]
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
  router.get('/count', (req, res) => {
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
      logger.error('Failed to get AllJobs jobs count', {
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
   * /api/jobs/alljobs/export/csv:
   *   get:
   *     summary: Export AllJobs jobs to CSV
   *     description: |
   *       Export AllJobs job listings to CSV format and download the file.
   *       
   *       **Features:**
   *       - UTF-8 BOM included for Excel compatibility with Hebrew text
   *       - Supports all filtering options
   *       - Automatic file cleanup after download
   *       - Returns file download, not JSON response
   *       
   *       **Filtering:**
   *       - Leave all filters empty to export ALL jobs
   *       - Use dateFrom/dateTo to filter by scraping date
   *       - Combine multiple filters for precise results
   *       
   *       **File Format:**
   *       - CSV with UTF-8 BOM encoding
   *       - Headers: jobId, title, company, description, location, jobType, requirements, applicationUrl, postedDate, companyId, source
   *       - Hebrew text fully supported
   *     tags: [AllJobs, Export]
   *     parameters:
   *       - $ref: '#/components/parameters/CompanyFilter'
   *       - $ref: '#/components/parameters/LocationFilter'
   *       - $ref: '#/components/parameters/JobTypeFilter'
   *       - $ref: '#/components/parameters/DateFromFilter'
   *       - $ref: '#/components/parameters/DateToFilter'
   *     responses:
   *       200:
   *         description: CSV file download
   *         content:
   *           text/csv:
   *             schema:
   *               type: string
   *               format: binary
   *             encoding:
   *               utf-8-bom:
   *                 contentType: text/csv; charset=utf-8
   *       404:
   *         description: No jobs found to export
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: "No jobs found to export"
   *               message: "No jobs found in database. Please run the scraper first."
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get('/export/csv', async (req, res): Promise<void> => {
    try {
      const company = req.query.company as string | undefined;
      const location = req.query.location as string | undefined;
      const jobType = req.query.jobType as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const filters = (company || location || jobType || dateFrom || dateTo)
        ? { company, location, jobType, dateFrom, dateTo }
        : undefined;

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

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `alljobs-export-${timestamp}`;
      const csvPath = await exporter.exportToCsv(jobs as any, filename);

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
        } else {
          fs.unlink(csvPath, (unlinkErr) => {
            if (unlinkErr) {
              logger.warn('Failed to delete temporary CSV file', {
                path: csvPath,
                error: unlinkErr.message,
              });
            }
          });
        }
      });
      return;
    } catch (error) {
      logger.error('Failed to export AllJobs CSV', {
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
   * /api/jobs/alljobs/export/json:
   *   get:
   *     summary: Export AllJobs jobs to JSON
   *     description: |
   *       Export AllJobs job listings to JSON format and download the file.
   *       
   *       **Features:**
   *       - Formatted JSON with 2-space indentation for readability
   *       - Supports all filtering options
   *       - Automatic file cleanup after download
   *       - Returns file download, not JSON response
   *       
   *       **Filtering:**
   *       - Leave all filters empty to export ALL jobs
   *       - Use dateFrom/dateTo to filter by scraping date
   *       - Combine multiple filters for precise results
   *       
   *       **File Format:**
   *       - JSON array of job objects
   *       - UTF-8 encoding
   *       - Pretty-printed for human readability
   *     tags: [AllJobs, Export]
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
   *               message: "No jobs found in database. Please run the scraper first."
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get('/export/json', async (req, res): Promise<void> => {
    try {
      const company = req.query.company as string | undefined;
      const location = req.query.location as string | undefined;
      const jobType = req.query.jobType as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const filters = (company || location || jobType || dateFrom || dateTo)
        ? { company, location, jobType, dateFrom, dateTo }
        : undefined;

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

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `alljobs-export-${timestamp}`;
      const jsonPath = await exporter.exportToJson(jobs as any, filename);

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
        } else {
          fs.unlink(jsonPath, (unlinkErr) => {
            if (unlinkErr) {
              logger.warn('Failed to delete temporary JSON file', {
                path: jsonPath,
                error: unlinkErr.message,
              });
            }
          });
        }
      });
      return;
    } catch (error) {
      logger.error('Failed to export AllJobs JSON', {
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
   * /api/jobs/alljobs/filters/options:
   *   get:
   *     summary: Get AllJobs filter options
   *     description: |
   *       Returns all unique values for companies, locations, and job types available in the AllJobs database.
   *       Useful for building filter dropdowns, autocomplete, or understanding what data is available.
   *       
   *       **Use Cases:**
   *       - Populate filter dropdown menus
   *       - Build search autocomplete
   *       - Display available filter options to users
   *       - Validate filter input values
   *     tags: [AllJobs]
   *     responses:
   *       200:
   *         description: Available filter options
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FilterOptionsResponse'
   *             example:
   *               success: true
   *               data:
   *                 companies: ["חברה א", "חברה ב", "TechTalent"]
   *                 locations: ["תל אביב", "ירושלים", "Haifa", "Tel Aviv"]
   *                 jobTypes: ["משרה מלאה", "משרה חלקית", "משמרות"]
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get('/filters/options', (_req, res) => {
    try {
      const jobs = db.getJobs();
      const companies = [...new Set(jobs.map((j) => j.company))].sort();
      const locations = [...new Set(jobs.map((j) => j.location))].sort();
      const jobTypes = [...new Set(jobs.map((j) => j.jobType))].sort();

      res.json({
        success: true,
        data: {
          companies,
          locations,
          jobTypes,
        },
      });
    } catch (error) {
      logger.error('Failed to get AllJobs filter options', {
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
   * /api/jobs/alljobs/{jobId}:
   *   get:
   *     summary: Get AllJobs job by ID
   *     description: |
   *       Retrieve a single job listing from AllJobs platform by its unique job ID.
   *       
   *       **Use Cases:**
   *       - Display full job details on a job detail page
   *       - Verify job existence before processing
   *       - Get complete job information including description and requirements
   *     tags: [AllJobs]
   *     parameters:
   *       - $ref: '#/components/parameters/JobIdParam'
   *     responses:
   *       200:
   *         description: Successful response with job details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required: ['success', 'data']
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/JobListing'
   *       404:
   *         description: Job not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: "Job not found"
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get('/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;
      const job = db.getJobById(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
        });
        return;
      }

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      logger.error('Failed to get AllJobs job by ID', {
        error: error instanceof Error ? error.message : String(error),
        jobId: req.params.jobId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve job',
      });
    }
  });

  return router;
}

