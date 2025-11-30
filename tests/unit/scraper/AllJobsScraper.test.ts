import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AllJobsScraper } from '../../../src/scraper/AllJobsScraper';
import { HttpClient } from '../../../src/http/HttpClient';
import { JobListingParser } from '../../../src/scraper/JobListingParser';
import { PaginationManager } from '../../../src/scraper/PaginationManager';
import { EvomiProxyManager } from '../../../src/proxy/EvomiProxyManager';
import { DataExporter } from '../../../src/export/DataExporter';
import { createLogger } from '../../../src/utils/logger';
import { loadConfig } from '../../../src/utils/validators';

// Mock dependencies
vi.mock('../../../src/http/HttpClient');
vi.mock('../../../src/scraper/JobListingParser');
vi.mock('../../../src/scraper/PaginationManager');
vi.mock('../../../src/export/DataExporter');

describe('AllJobsScraper', () => {
  let scraper: AllJobsScraper;
  let httpClient: HttpClient;
  let parser: JobListingParser;
  let paginationManager: PaginationManager;
  let exporter: DataExporter;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger('test');
    const proxyManager = new EvomiProxyManager('test-key', logger);
    httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: 100,
      maxRetries: 3,
      retryDelayMs: 50,
    });
    parser = new JobListingParser(logger);
    paginationManager = new PaginationManager('https://www.alljobs.co.il', logger);
    exporter = new DataExporter('./output', logger);

    scraper = new AllJobsScraper(
      httpClient,
      parser,
      paginationManager,
      exporter,
      logger
    );
  });

  it('should create an instance', () => {
    expect(scraper).toBeDefined();
  });

  it('should scrape jobs from a single page', async () => {
    const mockHtml = '<html><div>Job 1</div></html>';
    const mockJobs = [
      {
        jobId: '123',
        title: 'Test Job',
        company: 'Test Company',
        description: 'Test',
        location: 'Test',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockHtml,
      status: 200,
      headers: {},
    } as any);

    vi.mocked(parser.parseJobListings).mockReturnValue(mockJobs);
    vi.mocked(paginationManager.getNextPageNumber).mockReturnValue(null);

    const result = await scraper.scrape({ maxPages: 1 });

    expect(result.jobs).toHaveLength(1);
    expect(result.totalPagesScraped).toBe(1);
  });

  it('should handle pagination across multiple pages', async () => {
    const mockHtml = '<html><div>Jobs</div></html>';
    const mockJobs = [
      {
        jobId: '123',
        title: 'Test Job',
        company: 'Test Company',
        description: 'Test',
        location: 'Test',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockHtml,
      status: 200,
      headers: {},
    } as any);

    vi.mocked(parser.parseJobListings).mockReturnValue(mockJobs);
    vi.mocked(paginationManager.getNextPageNumber)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(null);

    const result = await scraper.scrape({ maxPages: 3 });

    expect(result.totalPagesScraped).toBe(3);
    expect(result.jobs.length).toBeGreaterThan(0);
  });

  it('should respect maxPages limit', async () => {
    const mockHtml = '<html><div>Jobs</div></html>';
    const mockJobs: any[] = [];

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockHtml,
      status: 200,
      headers: {},
    } as any);

    vi.mocked(parser.parseJobListings).mockReturnValue(mockJobs);
    vi.mocked(paginationManager.getNextPageNumber).mockReturnValue(2);

    const result = await scraper.scrape({ maxPages: 1 });

    expect(result.totalPagesScraped).toBe(1);
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });

  it('should resume from specified page', async () => {
    const mockHtml = '<html><div>Jobs</div></html>';
    const mockJobs: any[] = [];

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockHtml,
      status: 200,
      headers: {},
    } as any);

    vi.mocked(parser.parseJobListings).mockReturnValue(mockJobs);
    vi.mocked(paginationManager.getNextPageNumber).mockReturnValue(null);

    const result = await scraper.scrape({ resumeFromPage: 5, maxPages: 1 });

    expect(result.totalPagesScraped).toBe(1);
    // Should start from page 5
    expect(vi.mocked(paginationManager.getPageUrl).mock.calls[0]?.[0]).toBe(5);
  });

  it('should export results after scraping', async () => {
    const mockHtml = '<html><div>Jobs</div></html>';
    const mockJobs = [
      {
        jobId: '123',
        title: 'Test Job',
        company: 'Test Company',
        description: 'Test',
        location: 'Test',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockHtml,
      status: 200,
      headers: {},
    } as any);

    vi.mocked(parser.parseJobListings).mockReturnValue(mockJobs);
    vi.mocked(paginationManager.getNextPageNumber).mockReturnValue(null);
    vi.mocked(exporter.exportAll).mockResolvedValue({
      json: './output/jobs.json',
      csv: './output/jobs.csv',
    });

    const result = await scraper.scrape({ maxPages: 1, exportResults: true });

    expect(exporter.exportAll).toHaveBeenCalled();
    expect(result.exportPaths).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(httpClient.get).mockRejectedValue(new Error('Network error'));

    await expect(scraper.scrape({ maxPages: 1 })).rejects.toThrow();
  });
});

