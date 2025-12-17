/**
 * Investigation script for Madlan project pages
 * Tests structure of new construction project pages
 */

import { EvomiProxyManager } from '../../../proxy/EvomiProxyManager';
import { HttpClient } from '../../../http/HttpClient';
import { createLogger } from '../../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function investigateProjects(): Promise<void> {
  const logger = createLogger('MadlanProjectsInvestigation');
  
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
  const projectsUrl = `${baseUrl}/projects-for-sale/ישראל`;

  const outputDir = path.join(process.cwd(), 'debug', 'madlan');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    logger.info('Fetching projects page...', { url: projectsUrl });
    const response = await httpClient.get(projectsUrl);
    const html = response.data;

    // Save HTML for analysis
    const filename = path.join(outputDir, 'projects.html');
    fs.writeFileSync(filename, html, 'utf-8');
    logger.info('Saved projects HTML', { filename, size: html.length });

    // Basic analysis
    const hasPagination = html.includes('page') || html.includes('next') || html.includes('הבא');
    const hasProjects = html.includes('project') || html.includes('פרויקט') || html.includes('בנייה');
    const hasTimeline = html.includes('date') || html.includes('תאריך') || html.includes('מועד');
    const hasPricing = html.includes('price') || html.includes('מחיר') || html.includes('₪');
    const hasDeveloper = html.includes('developer') || html.includes('יזם') || html.includes('קבלן');

    logger.info('Analysis for projects:', {
      hasPagination,
      hasProjects,
      hasTimeline,
      hasPricing,
      hasDeveloper,
      htmlLength: html.length,
    });

  } catch (error) {
    logger.error('Failed to fetch projects page', {
      error: error instanceof Error ? error.message : String(error),
      url: projectsUrl,
    });
  }

  logger.info('Projects investigation complete. Check debug/madlan/ directory for saved HTML files.');
}

// Run investigation
investigateProjects().catch(error => {
  console.error('Investigation failed:', error);
  process.exit(1);
});

