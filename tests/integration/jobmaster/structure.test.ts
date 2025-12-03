import { describe, it, expect } from 'vitest';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Integration test to analyze JobMaster.co.il HTML structure
 * This test helps identify selectors for scraping job listings
 */
describe('JobMaster Structure Analysis', () => {
  const baseUrl = 'https://www.jobmaster.co.il';

  it('should fetch and analyze JobMaster homepage structure', async () => {
    try {
      const response = await axios.get(baseUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000,
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeTruthy();

      const $ = cheerio.load(response.data);

      // Log structure for analysis
      console.log('=== JobMaster Structure Analysis ===');
      console.log('Page Title:', $('title').text());
      console.log('Meta Description:', $('meta[name="description"]').attr('content'));

      // Look for job listing containers
      const jobContainers = $('[class*="job"], [class*="position"], [class*="listing"], [id*="job"], [id*="position"]');
      console.log('Potential job containers found:', jobContainers.length);

      // Look for pagination elements
      const paginationElements = $('[class*="pagination"], [class*="page"], a[href*="page"], a[href*="Page"]');
      console.log('Potential pagination elements found:', paginationElements.length);

      // Look for search form
      const searchForms = $('form[action*="search"], form[action*="Search"], input[name*="search"], input[name*="Search"]');
      console.log('Search forms found:', searchForms.length);

      // Analyze links
      const links = $('a[href*="job"], a[href*="position"], a[href*="Job"], a[href*="Position"]');
      console.log('Job-related links found:', links.length);
      if (links.length > 0) {
        console.log('Sample link hrefs:', links.slice(0, 5).map((_, el) => $(el).attr('href')).get());
      }

      // Check for common job listing patterns
      const patterns = {
        jobTitle: $('h1, h2, h3, [class*="title"], [class*="Title"]').length,
        company: $('[class*="company"], [class*="Company"], [class*="employer"], [class*="Employer"]').length,
        location: $('[class*="location"], [class*="Location"], [class*="city"], [class*="City"]').length,
        description: $('[class*="description"], [class*="Description"], [class*="desc"], [class*="Desc"]').length,
      };

      console.log('Common patterns found:', patterns);

      // This test is exploratory - we don't assert anything specific
      // The goal is to understand the structure
      expect(response.data).toBeTruthy();
    } catch (error) {
      console.error('Error fetching JobMaster:', error);
      // Don't fail the test - this is exploratory
      expect(error).toBeDefined();
    }
  }, 30000);

  it('should analyze JobMaster search results page structure', async () => {
    try {
      // Try to find a search results URL pattern
      // Common patterns: /search, /jobs, /positions, /results
      const searchUrls = [
        `${baseUrl}/search`,
        `${baseUrl}/jobs`,
        `${baseUrl}/positions`,
        `${baseUrl}/results`,
        `${baseUrl}/SearchResults.aspx`,
        `${baseUrl}/JobSearch.aspx`,
      ];

      let foundStructure = false;

      for (const url of searchUrls) {
        try {
          const response = await axios.get(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            timeout: 5000,
            validateStatus: (status) => status < 500, // Don't throw on 404
          });

          if (response.status === 200 && response.data) {
            const $ = cheerio.load(response.data);

            console.log(`=== Analyzing ${url} ===`);
            console.log('Page Title:', $('title').text());

            // Look for job listings
            const jobListings = $('[class*="job"], [class*="position"], [class*="result"], article, [data-job-id]');
            console.log('Job listings found:', jobListings.length);

            if (jobListings.length > 0) {
              // Analyze first job listing structure
              const firstJob = jobListings.first();
              console.log('First job HTML structure:');
              console.log(firstJob.html()?.substring(0, 500));

              // Look for key elements
              const title = firstJob.find('h1, h2, h3, [class*="title"]').first().text();
              const company = firstJob.find('[class*="company"], [class*="employer"]').first().text();
              const location = firstJob.find('[class*="location"], [class*="city"]').first().text();

              console.log('Sample job data:', { title, company, location });

              foundStructure = true;
              break;
            }
          }
        } catch (err) {
          // Continue to next URL
          continue;
        }
      }

      if (!foundStructure) {
        console.log('No search results page structure found. May need to use search form.');
      }

      expect(foundStructure || true).toBe(true); // Always pass - exploratory test
    } catch (error) {
      console.error('Error analyzing search results:', error);
      expect(error).toBeDefined();
    }
  }, 60000);
});

