import { Router } from 'express';
import * as path from 'path';
import type { Logger } from '../../../utils/logger';
import { FreesbeDatabaseManager } from '../../../database/freesbe/FreesbeDatabaseManager';
import { DataExporter } from '../../../export/DataExporter';
import type { FreesbeListing } from '../../../types/FreesbeListing';

/**
 * Exports Freesbe listings to CSV format
 */
function exportFreesbeListingsToCsv(listings: FreesbeListing[]): string {
  if (listings.length === 0) {
    return '';
  }

  const headers = [
    'carId',
    'make',
    'model',
    'year',
    'version',
    'price',
    'monthlyPayment',
    'mileage',
    'hand',
    'transmission',
    'fuelType',
    'location',
    'city',
    'aggregatedData',
    'images',
    'listingUrl',
    'postedDate',
  ];

  const rows = listings.map((listing) => {
    return [
      escapeCsvField(listing.carId),
      escapeCsvField(listing.make),
      escapeCsvField(listing.model),
      escapeCsvField(listing.year?.toString() || ''),
      escapeCsvField(listing.version || ''),
      escapeCsvField(listing.price?.toString() || ''),
      escapeCsvField(listing.monthlyPayment?.toString() || ''),
      escapeCsvField(listing.mileage?.toString() || ''),
      escapeCsvField(listing.hand?.toString() || ''),
      escapeCsvField(listing.transmission || ''),
      escapeCsvField(listing.fuelType || ''),
      escapeCsvField(listing.location || ''),
      escapeCsvField(listing.city || ''),
      escapeCsvField(listing.aggregatedData ? JSON.stringify(listing.aggregatedData) : ''),
      escapeCsvField(listing.images?.join('; ') || ''),
      escapeCsvField(listing.listingUrl),
      escapeCsvField(listing.postedDate || ''),
    ];
  });

  const csvLines = [headers.join(',')].concat(
    rows.map((row) => row.join(','))
  );
  const csvContent = csvLines.join('\n');

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
 * Creates router for Freesbe API endpoints
 */
export function createFreesbeRouter(logger: Logger, outputDir: string): Router {
  const router = Router();
  const dbPath = path.join(process.cwd(), 'data', 'freesbe.db');
  const db = new FreesbeDatabaseManager(dbPath, logger);
  const exporter = new DataExporter(outputDir, logger);

  /**
   * @swagger
   * /api/cars/freesbe:
   *   get:
   *     summary: Get Freesbe car listings
   *     description: Retrieve aggregated car listing data from Freesbe with optional filters
   *     tags: [Cars, Freesbe]
   *     parameters:
   *       - name: make
   *         in: query
   *         schema:
   *           type: string
   *       - name: model
   *         in: query
   *         schema:
   *           type: string
   *       - name: year
   *         in: query
   *         schema:
   *           type: integer
   *       - name: minPrice
   *         in: query
   *         schema:
   *           type: number
   *       - name: maxPrice
   *         in: query
   *         schema:
   *           type: number
   *       - name: location
   *         in: query
   *         schema:
   *           type: string
   *       - name: limit
   *         in: query
   *         schema:
   *           type: integer
   *       - name: offset
   *         in: query
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Successful response with listings
   */
  router.get('/', (req, res) => {
    try {
      const filters = {
        make: req.query.make as string | undefined,
        model: req.query.model as string | undefined,
        year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        location: req.query.location as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const listings = db.getListings(filters);
      const total = db.getListingsCount();

      res.json({
        success: true,
        data: listings,
        pagination: {
          total,
          limit: filters.limit || total,
          offset: filters.offset || 0,
        },
      });
    } catch (error) {
      logger.error('Failed to get Freesbe listings', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve listings',
      });
    }
  });

  /**
   * @swagger
   * /api/cars/freesbe/count:
   *   get:
   *     summary: Get Freesbe listing count
   *     tags: [Cars, Freesbe]
   *     responses:
   *       200:
   *         description: Successful response with count
   */
  router.get('/count', (_req, res) => {
    try {
      const count = db.getListingsCount();
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Failed to get Freesbe count', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve count',
      });
    }
  });

  /**
   * @swagger
   * /api/cars/freesbe/export/csv:
   *   get:
   *     summary: Export Freesbe listings to CSV
   *     tags: [Cars, Freesbe]
   *     responses:
   *       200:
   *         description: CSV file download
   */
  router.get('/export/csv', (req, res) => {
    try {
      const filters = {
        make: req.query.make as string | undefined,
        model: req.query.model as string | undefined,
        year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        location: req.query.location as string | undefined,
      };

      const listings = db.getListings(filters);
      const csv = exportFreesbeListingsToCsv(listings);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="freesbe_listings_${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      logger.error('Failed to export Freesbe CSV', {
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
   * /api/cars/freesbe/export/json:
   *   get:
   *     summary: Export Freesbe listings to JSON
   *     tags: [Cars, Freesbe]
   *     responses:
   *       200:
   *         description: JSON file download
   */
  router.get('/export/json', async (req, res) => {
    try {
      const filters = {
        make: req.query.make as string | undefined,
        model: req.query.model as string | undefined,
        year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        location: req.query.location as string | undefined,
      };

      const listings = db.getListings(filters);
      const jsonPath = await exporter.exportToJson(listings as any[], `freesbe_listings_${Date.now()}.json`);

      res.download(jsonPath, (err) => {
        if (err) {
          logger.error('Failed to download Freesbe JSON', {
            error: err instanceof Error ? err.message : String(err),
          });
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: 'Failed to download JSON file',
            });
          }
        }
      });
    } catch (error) {
      logger.error('Failed to export Freesbe JSON', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to export JSON',
      });
    }
  });

  return router;
}

