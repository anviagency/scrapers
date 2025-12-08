/**
 * Investigation script to check for API endpoints in Madlan
 * Checks network requests and embedded JSON data
 */

import { HttpClient } from '../../../http/HttpClient';
import { createLogger } from '../../../utils/logger';
import { EvomiProxyManager } from '../../../proxy/EvomiProxyManager';
import * as dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const logger = createLogger('madlan-api-investigator');
const proxyManager = new EvomiProxyManager(process.env.EVOMI_PROXY_KEY || '', logger, process.env.EVOMI_PROXY_ENDPOINT);
const httpClient = new HttpClient(proxyManager, logger, {
  rateLimitDelayMs: 1000,
  maxRetries: 3,
  retryDelayMs: 5000,
});

async function checkApiEndpoints(): Promise<void> {
  const testUrl = 'https://www.madlan.co.il/for-sale/תל-אביב?page=1';
  logger.info(`Checking for API endpoints in: ${testUrl}`);
  
  try {
    const response = await httpClient.get(testUrl);
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Check for embedded JSON data
    logger.info('Checking for embedded JSON data...');
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html() || '';
      
      // Look for JSON data structures
      if (content.includes('window.__') || content.includes('window.data') || content.includes('__NEXT_DATA__')) {
        logger.info('Found potential data structure', { snippet: content.substring(0, 500) });
      }
      
      // Look for API endpoints
      const apiMatches = content.match(/https?:\/\/[^"'\s]+(api|json)[^"'\s]*/gi);
      if (apiMatches && apiMatches.length > 0) {
        logger.info('Found API endpoints:', { endpoints: apiMatches });
      }
    }
    
    // Check for data attributes
    logger.info('Checking for data attributes...');
    $('[data-*]').each((_, el) => {
      const attrs = Object.keys(el.attribs).filter(k => k.startsWith('data-'));
      if (attrs.length > 0) {
        logger.debug('Found data attributes', { attributes: attrs });
      }
    });
    
    // Check response headers for API hints
    logger.info('Response headers:', response.headers);
    
    // Save HTML for manual inspection
    const fs = require('fs');
    const path = require('path');
    const outputDir = path.join(process.cwd(), 'debug', 'madlan');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outputDir, 'api-check.html'), html);
    logger.info(`Saved HTML to ${path.join(outputDir, 'api-check.html')}`);
    
  } catch (error) {
    logger.error('Failed to check API endpoints', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

checkApiEndpoints();

