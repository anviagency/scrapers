import { Router } from 'express';
import * as path from 'path';
import type { Logger } from '../../../utils/logger';
import { CarWizDatabaseManager } from '../../../database/carwiz/CarWizDatabaseManager';
import type { CarWizListing } from '../../../types/CarWizListing';

/**
 * Helper function to export CarWiz listings to CSV
 */
function exportCarWizListingsToCsv(listings: CarWizListing[]): string {
  const headers = [
    'carId',
    'make',
    'model',
    'year',
    'price',
    'previousPrice',
    'priceDifference',
    'kilometrage',
    'hand',
    'city',
    'agencyName',
    'agencyDisplayName',
    'fuelType',
    'gear',
    'engineDisplacement',
    'colorName',
    'category',
    'segment',
    'listingUrl',
    'createdAt',
    'updatedAt',
  ];

  const rows = listings.map((listing) => {
    return [
      escapeCsvField(listing.carId),
      escapeCsvField(listing.specification?.makeName || ''),
      escapeCsvField(listing.specification?.modelName || ''),
      escapeCsvField(listing.year?.toString() || ''),
      escapeCsvField(listing.price?.toString() || ''),
      escapeCsvField(listing.previousPrice?.toString() || ''),
      escapeCsvField(listing.priceDifference?.toString() || ''),
      escapeCsvField(listing.kilometrage?.toString() || ''),
      escapeCsvField(listing.hand?.toString() || ''),
      escapeCsvField(listing.agencyBranch?.city || ''),
      escapeCsvField(listing.agencyBranch?.agency?.name || ''),
      escapeCsvField(listing.agencyBranch?.agency?.displayName || ''),
      escapeCsvField(listing.specification?.fuelType || ''),
      escapeCsvField(listing.specification?.gear || ''),
      escapeCsvField(listing.specification?.engineDisplacement?.toString() || ''),
      escapeCsvField(listing.colorName || ''),
      escapeCsvField(listing.specification?.category || ''),
      escapeCsvField(listing.specification?.segment || ''),
      escapeCsvField(listing.listingUrl || ''),
      escapeCsvField(listing.createdAt || ''),
      escapeCsvField(listing.updatedAt || ''),
    ];
  });

  const csvLines = [headers.join(',')].concat(
    rows.map((row) => row.join(','))
  );
  const csvContent = csvLines.join('\n');

  const BOM = '\uFEFF';
  return BOM + csvContent;
}

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
 * Creates router for CarWiz API endpoints
 */
export function createCarWizRouter(logger: Logger, _outputDir: string): Router {
  const router = Router();
  const dbPath = path.join(process.cwd(), 'data', 'carwiz.db');
  const db = new CarWizDatabaseManager(dbPath, logger);

  /**
   * @swagger
   * /api/cars/carwiz:
   *   get:
   *     summary: Get CarWiz car listings
   *     tags: [Cars, CarWiz]
   *     parameters:
   *       - in: query
   *         name: make
   *         schema:
   *           type: string
   *         description: Filter by car make
   *       - in: query
   *         name: model
   *         schema:
   *           type: string
   *         description: Filter by car model
   *       - in: query
   *         name: year
   *         schema:
   *           type: integer
   *         description: Filter by year
   *       - in: query
   *         name: minPrice
   *         schema:
   *           type: number
   *         description: Minimum price filter
   *       - in: query
   *         name: maxPrice
   *         schema:
   *           type: number
   *         description: Maximum price filter
   *       - in: query
   *         name: city
   *         schema:
   *           type: string
   *         description: Filter by city
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Limit results
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *         description: Offset for pagination
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
        city: req.query.city as string | undefined,
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
      logger.error('Failed to get CarWiz listings', {
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
   * /api/cars/carwiz/count:
   *   get:
   *     summary: Get CarWiz listing count
   *     tags: [Cars, CarWiz]
   *     responses:
   *       200:
   *         description: Successful response with count
   */
  router.get('/count', (_req, res) => {
    try {
      const count = db.getListingsCount();
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Failed to get CarWiz count', {
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
   * /api/cars/carwiz/export/csv:
   *   get:
   *     summary: Export CarWiz listings to CSV
   *     tags: [Cars, CarWiz]
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
        city: req.query.city as string | undefined,
      };

      const listings = db.getListings(filters);
      const csv = exportCarWizListingsToCsv(listings);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="carwiz_listings_${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      logger.error('Failed to export CarWiz CSV', {
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
   * /api/cars/carwiz/sessions:
   *   get:
   *     summary: Get CarWiz scraping sessions
   *     tags: [Cars, CarWiz]
   *     responses:
   *       200:
   *         description: Successful response with sessions
   */
  router.get('/sessions', (_req, res) => {
    try {
      const sessions = db.getScrapingSessions(10);
      res.json({ success: true, sessions });
    } catch (error) {
      logger.error('Failed to get CarWiz sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve sessions',
      });
    }
  });

  /**
   * @swagger
   * /api/cars/carwiz/stats:
   *   get:
   *     summary: Get CarWiz statistics
   *     tags: [Cars, CarWiz]
   *     responses:
   *       200:
   *         description: Successful response with statistics
   */
  router.get('/stats', (_req, res) => {
    try {
      const total = db.getListingsCount();
      const listings = db.getListings({ limit: 10000 });
      const lastSession = db.getLastScrapingSession();

      // Calculate statistics
      const makes = [...new Set(listings.map(l => l.specification?.makeName).filter(Boolean))];
      const cities = [...new Set(listings.map(l => l.agencyBranch?.city).filter(Boolean))];
      const prices = listings.map(l => l.price).filter(p => p !== null && p !== undefined) as number[];
      const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

      res.json({
        success: true,
        stats: {
          total,
          makes: makes.length,
          cities: cities.length,
          avgPrice,
          lastSession,
        },
      });
    } catch (error) {
      logger.error('Failed to get CarWiz stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics',
      });
    }
  });

  return router;
}
