/**
 * Investigation script for Madlan listing pages
 * Tests structure of sales, rentals, and commercial listing pages
 */

import { EvomiProxyManager } from '../../../proxy/EvomiProxyManager';
import { HttpClient } from '../../../http/HttpClient';
import { createLogger } from '../../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function investigateListings(): Promise<void> {
  const logger = createLogger('MadlanInvestigation');
  
  // Initialize HTTP client with proxy
  const proxyKey = process.env.EVOMI_PROXY_KEY || '';
  const proxyEndpoint = process.env.EVOMI_PROXY_ENDPOINT;
  const proxyUsername = process.env.EVOMI_PROXY_USERNAME;
  const proxyPassword = process.env.EVOMI_PROXY_PASSWORD;
  const proxyManager = new EvomiProxyManager({
    proxyKey,
    logger,
    endpoint: proxyEndpoint,
    username: proxyUsername,
    password: proxyPassword,
  });
  const httpClient = new HttpClient(proxyManager, logger, {
    rateLimitDelayMs: 2000,
    maxRetries: 3,
    retryDelayMs: 1000,
  });

  const baseUrl = 'https://www.madlan.co.il';
  const testUrls = {
    sale: `${baseUrl}/for-sale/ישראל`,
    rent: `${baseUrl}/for-rent/ישראל`,
    commercial: `${baseUrl}/commercial-market`,
  };

  const outputDir = path.join(process.cwd(), 'debug', 'madlan');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const [type, url] of Object.entries(testUrls)) {
    try {
      logger.info(`Fetching ${type} listing page...`, { url });
      const response = await httpClient.get(url);
      const html = response.data;

      // Save HTML for analysis
      const filename = path.join(outputDir, `listings-${type}.html`);
      fs.writeFileSync(filename, html, 'utf-8');
      logger.info(`Saved ${type} listing HTML`, { filename, size: html.length });

      // Basic analysis
      const hasPagination = html.includes('page') || html.includes('next') || html.includes('הבא');
      const hasListings = html.includes('listing') || html.includes('property') || html.includes('נכס');
      const hasPrice = html.includes('price') || html.includes('מחיר') || html.includes('₪');
      const hasImages = html.includes('img') || html.includes('image') || html.includes('תמונה');

      logger.info(`Analysis for ${type}:`, {
        hasPagination,
        hasListings,
        hasPrice,
        hasImages,
        htmlLength: html.length,
      });

      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      logger.error(`Failed to fetch ${type} listing page`, {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
    }
  }

  logger.info('Investigation complete. Check debug/madlan/ directory for saved HTML files.');
}

// Run investigation
investigateListings().catch(error => {
  console.error('Investigation failed:', error);
  process.exit(1);
});

