import { Router } from 'express';
import * as fs from 'fs';
import type { MadlanDatabaseManager } from '../../database/madlan/MadlanDatabaseManager';
import type { DataExporter } from '../../export/DataExporter';
import type { MadlanListing } from '../../types/MadlanListing';

/**
 * Exports Madlan listings to CSV format
 */
function exportMadlanListingsToCsv(listings: MadlanListing[]): string {
  if (listings.length === 0) {
    return '';
  }

  // CSV headers for Madlan listings
  const headers = [
    'listingId',
    'title',
    'price',
    'propertyType',
    'areaSqm',
    'rooms',
    'floor',
    'address',
    'city',
    'neighborhood',
    'description',
    'features',
    'agentType',
    'agentName',
    'agentPhone',
    'listingType',
    'listingUrl',
    'postedDate',
    'updatedDate',
    'imageUrls',
  ];

  // CSV rows
  const rows = listings.map((listing) => {
    return [
      escapeCsvField(listing.listingId),
      escapeCsvField(listing.title),
      escapeCsvField(listing.price?.toString() || ''),
      escapeCsvField(listing.propertyType || ''),
      escapeCsvField(listing.areaSqm?.toString() || ''),
      escapeCsvField(listing.rooms?.toString() || ''),
      escapeCsvField(listing.floor || ''),
      escapeCsvField(listing.address || ''),
      escapeCsvField(listing.city || ''),
      escapeCsvField(listing.neighborhood || ''),
      escapeCsvField(listing.description || ''),
      escapeCsvField(listing.features?.join('; ') || ''),
      escapeCsvField(listing.agentType),
      escapeCsvField(listing.agentName || ''),
      escapeCsvField(listing.agentPhone || ''),
      escapeCsvField(listing.listingType),
      escapeCsvField(listing.listingUrl),
      escapeCsvField(listing.postedDate || ''),
      escapeCsvField(listing.updatedDate || ''),
      escapeCsvField(listing.imageUrls?.join('; ') || ''),
    ];
  });

  // Combine headers and rows
  const csvLines = [headers.join(',')].concat(
    rows.map((row) => row.join(','))
  );
  const csvContent = csvLines.join('\n');

  // Add UTF-8 BOM for Excel compatibility with Hebrew
  const BOM = '\uFEFF';
  return BOM + csvContent;
}

/**
 * Escapes CSV field values
 */
function escapeCsvField(field: string | null | undefined): string {
  if (!field) {
    return '';
  }

  let str = String(field).trim();
  str = str.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF]/g, '');
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, '');

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  return str;
}

/**
 * Creates Madlan API routes
 */
export function createMadlanRoutes(
  database: MadlanDatabaseManager,
  exporter: DataExporter
): Router {
  const router = Router();

  /**
   * @swagger
   * /api/realestate/madlan/listings:
   *   get:
   *     summary: Get Madlan real estate listings
   *     description: Retrieve real estate listings from Madlan with optional filters
   *     tags: [Real Estate, Madlan]
   *     parameters:
   *       - name: listingType
   *         in: query
   *         description: Filter by listing type
   *         schema:
   *           type: string
   *           enum: [sale, rent, commercial]
   *       - name: city
   *         in: query
   *         description: Filter by city name
   *         schema:
   *           type: string
   *       - name: agentType
   *         in: query
   *         description: Filter by agent type
   *         schema:
   *           type: string
   *           enum: [private, agent, new_construction]
   *       - name: limit
   *         in: query
   *         description: Maximum number of listings to return
   *         schema:
   *           type: integer
   *           default: 100
   *       - name: offset
   *         in: query
   *         description: Number of listings to skip
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: Successful response with listings
   *       500:
   *         description: Internal server error
   */
  router.get('/listings', (req, res) => {
    try {
      const filters = {
        listingType: req.query.listingType as 'sale' | 'rent' | 'commercial' | undefined,
        city: req.query.city as string | undefined,
        agentType: req.query.agentType as 'private' | 'agent' | 'new_construction' | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const listings = database.getListings(filters);
      res.json({ success: true, data: listings, count: listings.length });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/listings/{id}:
   *   get:
   *     summary: Get a single Madlan listing by ID
   *     tags: [Real Estate, Madlan]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: Listing ID
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Successful response with listing
   *       404:
   *         description: Listing not found
   *       500:
   *         description: Internal server error
   */
  router.get('/listings/:id', (req, res) => {
    try {
      const listing = database.getListingById(req.params.id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found' });
      }
      return res.json({ success: true, data: listing });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/projects:
   *   get:
   *     summary: Get Madlan real estate projects
   *     description: Retrieve real estate projects from Madlan with optional filters
   *     tags: [Real Estate, Madlan]
   *     parameters:
   *       - name: developer
   *         in: query
   *         description: Filter by developer name
   *         schema:
   *           type: string
   *       - name: limit
   *         in: query
   *         description: Maximum number of projects to return
   *         schema:
   *           type: integer
   *           default: 100
   *       - name: offset
   *         in: query
   *         description: Number of projects to skip
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: Successful response with projects
   *       500:
   *         description: Internal server error
   */
  router.get('/projects', (req, res) => {
    try {
      const filters = {
        developer: req.query.developer as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const projects = database.getProjects(filters);
      res.json({ success: true, data: projects, count: projects.length });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/projects/{id}:
   *   get:
   *     summary: Get a single Madlan project by ID
   *     tags: [Real Estate, Madlan]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: Project ID
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Successful response with project
   *       404:
   *         description: Project not found
   *       500:
   *         description: Internal server error
   */
  router.get('/projects/:id', (req, res) => {
    try {
      const project = database.getProjectById(req.params.id);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      return res.json({ success: true, data: project });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/listings/{id}/images:
   *   get:
   *     summary: Get images for a Madlan listing
   *     tags: [Real Estate, Madlan]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: Listing ID
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Successful response with images
   *       500:
   *         description: Internal server error
   */
  router.get('/listings/:id/images', (req, res) => {
    try {
      const images = database.getImagesForListing(req.params.id);
      res.json({ success: true, data: images, count: images.length });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/projects/{id}/images:
   *   get:
   *     summary: Get images for a Madlan project
   *     tags: [Real Estate, Madlan]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: Project ID
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Successful response with images
   *       500:
   *         description: Internal server error
   */
  router.get('/projects/:id/images', (req, res) => {
    try {
      const images = database.getImagesForProject(req.params.id);
      res.json({ success: true, data: images, count: images.length });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/export/listings:
   *   get:
   *     summary: Export Madlan listings to CSV or JSON
   *     description: Export real estate listings to CSV or JSON format
   *     tags: [Real Estate, Madlan, Export]
   *     parameters:
   *       - name: format
   *         in: query
   *         description: Export format
   *         schema:
   *           type: string
   *           enum: [csv, json]
   *           default: csv
   *       - name: listingType
   *         in: query
   *         description: Filter by listing type
   *         schema:
   *           type: string
   *           enum: [sale, rent, commercial]
   *       - name: city
   *         in: query
   *         description: Filter by city name
   *         schema:
   *           type: string
   *       - name: agentType
   *         in: query
   *         description: Filter by agent type
   *         schema:
   *           type: string
   *           enum: [private, agent, new_construction]
   *     responses:
   *       200:
   *         description: File download (CSV or JSON)
   *       500:
   *         description: Internal server error
   */
  router.get('/export/listings', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'csv';
      const filters = {
        listingType: req.query.listingType as 'sale' | 'rent' | 'commercial' | undefined,
        city: req.query.city as string | undefined,
        agentType: req.query.agentType as 'private' | 'agent' | 'new_construction' | undefined,
      };

      const listings = database.getListings(filters);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=madlan-listings-${Date.now()}.json`);
        res.json(listings);
      } else {
        // Convert to CSV format - Madlan listings have different fields than jobs
        const csvContent = exportMadlanListingsToCsv(listings);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=madlan-listings-${Date.now()}.csv`);
        res.send(csvContent);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/export/csv:
   *   get:
   *     summary: Export Madlan listings to CSV (alias for /export/listings?format=csv)
   *     description: |
   *       Export Madlan real estate listings to CSV format and download the file.
   *       This is an alias endpoint for convenience, equivalent to `/export/listings?format=csv`.
   *       
   *       **Features:**
   *       - UTF-8 BOM included for Excel compatibility with Hebrew text
   *       - Supports all filtering options
   *       - Returns file download, not JSON response
   *       
   *       **Filtering:**
   *       - Leave all filters empty to export ALL listings
   *       - Use listingType, city, or agentType to filter results
   *       - Combine multiple filters for precise results
   *     tags: [Real Estate, Madlan, Export]
   *     parameters:
   *       - name: listingType
   *         in: query
   *         description: Filter by listing type
   *         schema:
   *           type: string
   *           enum: [sale, rent, commercial]
   *       - name: city
   *         in: query
   *         description: Filter by city name
   *         schema:
   *           type: string
   *       - name: agentType
   *         in: query
   *         description: Filter by agent type
   *         schema:
   *           type: string
   *           enum: [private, agent, new_construction]
   *     responses:
   *       200:
   *         description: CSV file download
   *         content:
   *           text/csv:
   *             schema:
   *               type: string
   *               format: binary
   *       404:
   *         description: No listings found to export
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 error:
   *                   type: string
   *       500:
   *         description: Internal server error
   */
  router.get('/export/csv', async (req, res) => {
    try {
      const filters = {
        listingType: req.query.listingType as 'sale' | 'rent' | 'commercial' | undefined,
        city: req.query.city as string | undefined,
        agentType: req.query.agentType as 'private' | 'agent' | 'new_construction' | undefined,
      };

      const listings = database.getListings(filters);

      if (listings.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No listings found to export',
          message: 'No listings found in database. Please run the scraper first.',
        });
        return;
      }

      // Convert to CSV format - Madlan listings have different fields than jobs
      const csvContent = exportMadlanListingsToCsv(listings);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=madlan-listings-${Date.now()}.csv`);
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/export/projects:
   *   get:
   *     summary: Export Madlan projects to CSV or JSON
   *     description: Export real estate projects to CSV or JSON format
   *     tags: [Real Estate, Madlan, Export]
   *     parameters:
   *       - name: format
   *         in: query
   *         description: Export format
   *         schema:
   *           type: string
   *           enum: [csv, json]
   *           default: csv
   *       - name: developer
   *         in: query
   *         description: Filter by developer name
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: File download (CSV or JSON)
   *       500:
   *         description: Internal server error
   */
  router.get('/export/projects', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'csv';
      const filters = {
        developer: req.query.developer as string | undefined,
      };

      const projects = database.getProjects(filters);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=madlan-projects-${Date.now()}.json`);
        res.json(projects);
      } else {
        // Convert to CSV format
        const csvPath = await exporter.exportToCsv(projects as any[], 'madlan-projects');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=madlan-projects-${Date.now()}.csv`);
        res.send(csvContent);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * @swagger
   * /api/realestate/madlan/stats:
   *   get:
   *     summary: Get Madlan statistics
   *     description: Get statistics about scraped Madlan data
   *     tags: [Real Estate, Madlan]
   *     responses:
   *       200:
   *         description: Successful response with statistics
   *       500:
   *         description: Internal server error
   */
  router.get('/stats', async (_req, res) => {
    try {
      const allListings = database.getListings();
      const allProjects = database.getProjects();

      const stats = {
        totalListings: allListings.length,
        totalProjects: allProjects.length,
        listingsByType: {
          sale: allListings.filter(l => l.listingType === 'sale').length,
          rent: allListings.filter(l => l.listingType === 'rent').length,
          commercial: allListings.filter(l => l.listingType === 'commercial').length,
        },
        listingsByAgentType: {
          private: allListings.filter(l => l.agentType === 'private').length,
          agent: allListings.filter(l => l.agentType === 'agent').length,
          new_construction: allListings.filter(l => l.agentType === 'new_construction').length,
        },
        cities: Array.from(new Set(allListings.map(l => l.city).filter(Boolean))).length,
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
