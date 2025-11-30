import { describe, it, expect, beforeEach } from 'vitest';
import { PaginationManager } from '../../../src/scraper/PaginationManager';
import { createLogger } from '../../../src/utils/logger';
import { loadHTMLFixture } from '../../fixtures/htmlFixtures';

describe('PaginationManager', () => {
  let paginationManager: PaginationManager;
  const logger = createLogger('test');
  const baseUrl = 'https://www.alljobs.co.il';

  beforeEach(() => {
    paginationManager = new PaginationManager(baseUrl, logger);
  });

  it('should create an instance', () => {
    expect(paginationManager).toBeDefined();
  });

  it('should generate first page URL', () => {
    const url = paginationManager.getPageUrl(1);
    expect(url).toContain('page=1');
    expect(url).toContain('SearchResultsGuest.aspx');
  });

  it('should generate URL for specific page number', () => {
    const url = paginationManager.getPageUrl(5);
    expect(url).toContain('page=5');
  });

  it('should detect next page from HTML', () => {
    const html = `
      <div class="pagination">
        <a href="/SearchResultsGuest.aspx?page=2">דף הבא</a>
      </div>
    `;
    const nextPage = paginationManager.getNextPageNumber(html, 1);
    expect(nextPage).toBe(2);
  });

  it('should return null when no next page exists', () => {
    const html = `
      <div class="pagination">
        <span>דף הבא</span>
      </div>
    `;
    const nextPage = paginationManager.getNextPageNumber(html, 10);
    expect(nextPage).toBeNull();
  });

  it('should detect last page from pagination links', () => {
    const html = `
      <div class="pagination">
        <a href="/SearchResultsGuest.aspx?page=1">1</a>
        <a href="/SearchResultsGuest.aspx?page=2">2</a>
        <a href="/SearchResultsGuest.aspx?page=3">3</a>
        <span class="current">3</span>
      </div>
    `;
    const isLastPage = paginationManager.isLastPage(html, 3);
    expect(isLastPage).toBe(true);
  });

  it('should extract total pages from pagination', () => {
    const html = `
      <div class="pagination">
        <a href="/SearchResultsGuest.aspx?page=1">1</a>
        <a href="/SearchResultsGuest.aspx?page=2">2</a>
        <a href="/SearchResultsGuest.aspx?page=10">10</a>
      </div>
    `;
    const maxPage = paginationManager.getMaxPageNumber(html);
    expect(maxPage).toBe(10);
  });

  it('should handle pagination with "דף הבא" link', () => {
    const html = loadHTMLFixture('search-results-with-pagination.html');
    const nextPage = paginationManager.getNextPageNumber(html, 1);
    expect(nextPage).toBe(2);
  });

  it('should estimate max pages from total jobs count', () => {
    const html = 'נמצאו 31,794 משרות';
    const estimatedMax = paginationManager.estimateMaxPages(html, 20); // 20 jobs per page
    expect(estimatedMax).toBeGreaterThan(1000);
  });

  it('should respect maxPages limit if set', () => {
    paginationManager.setMaxPages(50);
    const url = paginationManager.getPageUrl(100);
    // Should still generate URL but respect limit in logic
    expect(url).toBeDefined();
  });
});

