import 'dotenv/config';
import { createLogger } from '../../utils/logger';
import { HttpClient } from '../../http/HttpClient';
import { EvomiProxyManager } from '../../proxy/EvomiProxyManager';
import { AllJobsSitemapScraper } from './AllJobsSitemapScraper';
import { CsvExporter } from './CsvExporter';
import { getConfig, type SitemapScraperConfig } from './config';

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<SitemapScraperConfig> {
  const args = process.argv.slice(2);
  const config: Partial<SitemapScraperConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--limit':
      case '-l':
        config.limit = parseInt(args[++i], 10);
        break;
      case '--offset':
      case '-o':
        config.offset = parseInt(args[++i], 10);
        break;
      case '--concurrency':
      case '-c':
        config.concurrency = parseInt(args[++i], 10);
        break;
      case '--no-proxy':
        config.useProxy = false;
        break;
      case '--proxy':
        config.useProxy = true;
        break;
      case '--output':
      case '-d':
        config.outputDir = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
AllJobs Sitemap Scraper
=======================

Usage: npx ts-node src/scrapers/alljobs-sitemap/index.ts [options]

Options:
  -l, --limit <number>       Limit number of jobs to scrape (for testing)
  -o, --offset <number>      Skip first N jobs
  -c, --concurrency <number> Max concurrent requests (default: 50)
  --proxy                    Enable proxy (default: true)
  --no-proxy                 Disable proxy
  -d, --output <dir>         Output directory (default: ./output/alljobs-sitemap)
  -h, --help                 Show this help message

Environment Variables:
  EVOMI_PROXY_KEY            Proxy API key
  EVOMI_PROXY_ENDPOINT       Proxy endpoint (host:port)
  EVOMI_PROXY_USERNAME       Proxy username
  EVOMI_PROXY_PASSWORD       Proxy password
  SITEMAP_URL                Sitemap URL to scrape
  CONCURRENCY                Max concurrent requests
  LIMIT                      Limit number of jobs
  OFFSET                     Skip first N jobs
  OUTPUT_DIR                 Output directory
  USE_PROXY                  Enable proxy (true/false)
  LOG_LEVEL                  Log level (info, debug, warn, error)

Examples:
  # Scrape all jobs with proxy
  npx ts-node src/scrapers/alljobs-sitemap/index.ts

  # Test run: scrape first 10 jobs without proxy
  npx ts-node src/scrapers/alljobs-sitemap/index.ts --limit 10 --no-proxy

  # Scrape 100 jobs starting from offset 500
  npx ts-node src/scrapers/alljobs-sitemap/index.ts --limit 100 --offset 500

  # Custom concurrency
  npx ts-node src/scrapers/alljobs-sitemap/index.ts --concurrency 25
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const logger = createLogger('alljobs-sitemap-scraper');

  // Parse CLI args and merge with env config
  const cliConfig = parseArgs();
  const config = getConfig(cliConfig);

  logger.info('Starting AllJobs Sitemap Scraper', {
    sitemapUrl: config.sitemapUrl,
    concurrency: config.concurrency,
    limit: config.limit || 'unlimited',
    offset: config.offset,
    useProxy: config.useProxy,
    outputDir: config.outputDir,
  });

  // Initialize proxy manager
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

  // Initialize HTTP client
  const httpClient = new HttpClient(proxyManager, logger, {
    rateLimitDelayMs: config.rateLimitDelayMs,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    useProxy: config.useProxy,
  });

  // Initialize scraper
  const scraper = new AllJobsSitemapScraper(httpClient, logger, config);

  // Initialize exporter
  const exporter = new CsvExporter(config.outputDir, logger);

  try {
    // Start scraping with progress reporting
    console.log('\nStarting scrape...\n');

    const result = await scraper.scrapeAll((progress) => {
      const percentage = Math.round((progress.completed / progress.total) * 100);
      const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
      process.stdout.write(
        `\r[${bar}] ${percentage}% | ${progress.completed}/${progress.total} | OK: ${progress.successful} | Fail: ${progress.failed}`
      );
    });

    console.log('\n\nScraping complete!\n');

    // Export results
    if (result.jobs.length > 0) {
      logger.info('Exporting results', { jobCount: result.jobs.length });

      const { csv, json } = await exporter.exportAll(result.jobs, 'alljobs-sitemap');

      console.log(`\nResults exported:`);
      console.log(`  CSV:  ${csv}`);
      console.log(`  JSON: ${json}`);
    } else {
      logger.warn('No jobs scraped');
    }

    // Print summary
    console.log(`\n${'='.repeat(50)}`);
    console.log('SCRAPE SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Processed: ${result.totalProcessed}`);
    console.log(`Successful:      ${result.successful}`);
    console.log(`Failed:          ${result.failed}`);
    console.log(`Duration:        ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log(`Jobs/second:     ${(result.successful / (result.durationMs / 1000)).toFixed(1)}`);
    console.log('='.repeat(50));

    if (result.failed > 0) {
      logger.warn('Some jobs failed to scrape', {
        failedCount: result.failed,
        sampleFailedUrls: result.failedUrls.slice(0, 5),
      });
    }
  } catch (error) {
    logger.error('Scraper failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
