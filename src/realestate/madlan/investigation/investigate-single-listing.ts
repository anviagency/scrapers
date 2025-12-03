/**
 * Investigation script for single Madlan listing page
 * Tests structure of individual listing detail pages
 */

import { EvomiProxyManager } from '../../../proxy/EvomiProxyManager';
import { HttpClient } from '../../../http/HttpClient';
import { createLogger } from '../../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

async function investigateSingleListing(): Promise<void> {
  const logger = createLogger('MadlanSingleListingInvestigation');
  
  // Initialize HTTP client with proxy
  const proxyKey = process.env.EVOMI_PROXY_KEY || '';
  const proxyEndpoint = process.env.EVOMI_PROXY_ENDPOINT;
  const proxyManager = new EvomiProxyManager(proxyKey, logger, proxyEndpoint);
  const httpClient = new HttpClient(proxyManager, logger, {
    rateLimitDelayMs: 2000,
    maxRetries: 3,
    retryDelayMs: 1000,
  });

  const baseUrl = 'https://www.madlan.co.il';

  // First, get a listing page to find individual listing URLs
  try {
    logger.info('Fetching listings page to find individual listing URLs...');
    const listingsResponse = await httpClient.get(`${baseUrl}/for-sale/ישראל`);
    const listingsHtml = listingsResponse.data;
    
    const $ = cheerio.load(listingsHtml);
    const listingLinks: string[] = [];
    
    // Try to find listing links
    $('a[href*="/for-sale/"], a[href*="/for-rent/"], a[href*="/commercial/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('ישראל') && href.length > 10) {
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
        if (!listingLinks.includes(fullUrl) && listingLinks.length < 3) {
          listingLinks.push(fullUrl);
        }
      }
    });

    logger.info(`Found ${listingLinks.length} listing URLs to investigate`);

    const outputDir = path.join(process.cwd(), 'debug', 'madlan');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (let i = 0; i < listingLinks.length; i++) {
      const listingUrl = listingLinks[i];
      try {
        logger.info(`Fetching listing ${i + 1}/${listingLinks.length}...`, { url: listingUrl });
        const response = await httpClient.get(listingUrl);
        const html = response.data;

        // Save HTML for analysis
        const filename = path.join(outputDir, `listing-${i + 1}.html`);
        fs.writeFileSync(filename, html, 'utf-8');
        logger.info(`Saved listing HTML`, { filename, size: html.length });

        // Parse with cheerio for detailed analysis
        const $listing = cheerio.load(html);
        
        // Extract key elements
        const title = $listing('h1').first().text().trim() || $listing('title').text().trim();
        const price = $listing('[class*="price"], [id*="price"], [data-price]').first().text().trim();
        const images = $listing('img').length;
        const description = $listing('[class*="description"], [id*="description"]').first().text().trim().substring(0, 200);
        
        logger.info(`Listing ${i + 1} analysis:`, {
          title: title.substring(0, 100),
          price: price.substring(0, 50),
          images,
          descriptionLength: description.length,
          htmlLength: html.length,
        });

        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        logger.error(`Failed to fetch listing ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
          url: listingUrl,
        });
      }
    }

  } catch (error) {
    logger.error('Failed to fetch listings page', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('Single listing investigation complete. Check debug/madlan/ directory for saved HTML files.');
}

// Run investigation
investigateSingleListing().catch(error => {
  console.error('Investigation failed:', error);
  process.exit(1);
});

