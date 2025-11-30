import { describe, it, expect } from 'vitest';
import { JobListingParser } from '../../../src/scraper/JobListingParser';
import { createLogger } from '../../../src/utils/logger';
import { loadHTMLFixture } from '../../fixtures/htmlFixtures';

describe('JobListingParser', () => {
  let parser: JobListingParser;
  const logger = createLogger('test');

  beforeEach(() => {
    parser = new JobListingParser(logger);
  });

  it('should parse a complete job listing from HTML', () => {
    const html = loadHTMLFixture('job-listing-complete.html');
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');

    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];
    expect(job.jobId).toBeDefined();
    expect(job.title).toBeDefined();
    expect(job.company).toBeDefined();
    expect(job.description).toBeDefined();
    expect(job.location).toBeDefined();
    expect(job.jobType).toBeDefined();
    expect(job.applicationUrl).toBeDefined();
  });

  it('should extract job ID from URL', () => {
    const html = `
      <div>
        <a href="/Search/UploadSingle.aspx?JobID=8391177">Job Title</a>
      </div>
    `;
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs[0].jobId).toBe('8391177');
  });

  it('should extract company name from link', () => {
    const html = `
      <div>
        <a href="/Employer/HP/Default.aspx?cid=150870">קבוצת אלקטרה</a>
      </div>
    `;
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs[0].company).toContain('אלקטרה');
  });

  it('should handle missing optional fields gracefully', () => {
    const html = `
      <div>
        <h2>Test Job</h2>
        <a href="/Search/UploadSingle.aspx?JobID=123">Link</a>
      </div>
    `;
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs.length).toBeGreaterThan(0);
    // Should not throw even if some fields are missing
  });

  it('should parse multiple job listings from search results page', () => {
    const html = loadHTMLFixture('search-results-page.html');
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs.length).toBeGreaterThan(1);
  });

  it('should handle Hebrew text correctly', () => {
    const html = `
      <div>
        <h2>דרוש /ה עו"ד בתחום המיסוי המוניציפאלי</h2>
        <a href="/Search/UploadSingle.aspx?JobID=8391177">Link</a>
        <p>משרדנו מתמחה במשפט מנהלי</p>
      </div>
    `;
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs[0].title).toContain('עו"ד');
    expect(jobs[0].description).toContain('משפט');
  });

  it('should extract job type (משרה מלאה/חלקית)', () => {
    const html = `
      <div>
        <h2>Test Job</h2>
        <a href="/Search/UploadSingle.aspx?JobID=123">Link</a>
        <p>סוג משרה: משרה מלאה</p>
      </div>
    `;
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs[0].jobType).toContain('משרה מלאה');
  });

  it('should construct absolute application URL', () => {
    const html = `
      <div>
        <h2>Test Job</h2>
        <a href="/Search/UploadSingle.aspx?JobID=8391177">Link</a>
      </div>
    `;
    const jobs = parser.parseJobListings(html, 'https://www.alljobs.co.il');
    expect(jobs[0].applicationUrl).toBe(
      'https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=8391177'
    );
  });
});

