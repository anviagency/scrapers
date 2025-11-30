import * as cheerio from 'cheerio';
import type { Logger } from '../utils/logger';
import { JobListingSchema, type JobListing } from '../types/JobListing';
import type { Element } from 'domhandler';

/**
 * Parser for extracting job listings from alljobs.co.il HTML
 */
export class JobListingParser {
  private readonly logger: Logger;
  private readonly baseUrl: string;

  /**
   * Creates a new JobListingParser instance
   * @param logger - Logger instance
   * @param baseUrl - Base URL of the website (for constructing absolute URLs)
   */
  constructor(logger: Logger, baseUrl: string = 'https://www.alljobs.co.il') {
    this.logger = logger;
    this.baseUrl = baseUrl;
  }

  /**
   * Parses job listings from HTML content
   * @param html - HTML content to parse
   * @param pageUrl - URL of the page being parsed (for constructing absolute URLs)
   * @returns Array of parsed job listings
   */
  parseJobListings(html: string, pageUrl: string): JobListing[] {
    try {
      const $ = cheerio.load(html);
      const jobs: JobListing[] = [];

      // Based on browser analysis, job listings appear in specific containers
      // Each job has a link with JobID in the URL and h2 heading with title
      $('a[href*="UploadSingle.aspx?JobID="]').each((_index: number, element: Element) => {
        try {
          const job = this.parseJobListing($, $(element), pageUrl);
          if (job) {
            jobs.push(job);
          }
        } catch (error) {
          this.logger.warn('Failed to parse job listing', {
            index: _index,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Alternative: Look for job listings by structure if the above doesn't work
      if (jobs.length === 0) {
        this.logger.debug('No jobs found with primary selector, trying alternative');
        $('h2').each((_index: number, element: Element) => {
          const $heading = $(element);
          const $link = $heading.find('a[href*="JobID="]').first();
          if ($link.length > 0) {
            try {
              const job = this.parseJobListing($, $link, pageUrl);
              if (job) {
                jobs.push(job);
              }
            } catch (error) {
              this.logger.warn('Failed to parse job from heading', {
                index: _index,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        });
      }

      this.logger.info('Parsed job listings', { count: jobs.length });
      return jobs;
    } catch (error) {
      this.logger.error('Failed to parse HTML', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Parses a single job listing from a link element
   * @param $ - Cheerio root instance
   * @param $link - Cheerio instance of the job link element
   * @param pageUrl - URL of the page being parsed
   * @returns Parsed job listing or null if parsing fails
   */
  private parseJobListing(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<Element>,
    _pageUrl: string
  ): JobListing | null {
    try {
      // Extract JobID from URL
      const href = $link.attr('href') || '';
      const jobIdMatch = href.match(/JobID=(\d+)/);
      if (!jobIdMatch) {
        return null;
      }
      const jobId = jobIdMatch[1];

      // Find the job container - the correct container is div.job-content-top or div.job-box
      // First try to find the job-box container (id="job-box-container{jobId}")
      let $container: cheerio.Cheerio<Element> = $(`#job-box-container${jobId}`).first() as cheerio.Cheerio<Element>;
      
      // If not found, try job-content-top which is inside job-box
      if ($container.length === 0) {
        $container = $link.closest('div.job-content-top, div.job-box').first() as cheerio.Cheerio<Element>;
      }
      
      // If still not found, go up from the link to find job-content-top
      if ($container.length === 0) {
        const $found = $link.closest('div').parent().parent().find('div.job-content-top').first();
        if ($found.length > 0) {
          $container = $found as cheerio.Cheerio<Element>;
        }
      }
      
      // Fallback: go up to find any container with job-related classes
      if ($container.length === 0) {
        $container = $link.closest('div[class*="job"], div[class*="result"], div[class*="item"], article, section').first() as cheerio.Cheerio<Element>;
      }
      
      // Last resort: use parent
      if ($container.length === 0) {
        $container = $link.parent() as cheerio.Cheerio<Element>;
      }

      // Extract title from link text or nearby heading
      let title = $link.text().trim();
      if (!title || title.length < 3) {
        const $heading = $link.closest('h2, h3, h4').first() || $container.find('h2, h3, h4').first();
        title = $heading.text().trim() || $link.text().trim();
      }
      
      // Clean title - remove extra whitespace
      title = title.replace(/\s+/g, ' ').trim();

      // Extract company name - the correct selector is div.T14 > a[href*="Employer/HP"]
      let company = '';
      let companyId: string | undefined;
      
      // Strategy 1: Look for company link in div.T14 (the correct structure)
      const $companyLink = $container.find('div.T14 a[href*="Employer/HP"]').first();
      if ($companyLink.length > 0) {
        company = $companyLink.text().trim();
        const companyIdMatch = $companyLink.attr('href')?.match(/cid=(\d+)/);
        if (companyIdMatch) {
          companyId = companyIdMatch[1];
        }
      }
      
      // Strategy 2: Fallback - look anywhere in container
      if (!company || company.length < 2) {
        const $fallbackCompanyLink = $container.find('a[href*="Employer/HP"]').first();
        if ($fallbackCompanyLink.length > 0) {
          company = $fallbackCompanyLink.text().trim();
          const companyIdMatch = $fallbackCompanyLink.attr('href')?.match(/cid=(\d+)/);
          if (companyIdMatch) {
            companyId = companyIdMatch[1];
          }
        }
      }

      // Extract location - the correct selector is div.job-content-top-location
      let location = '';
      
      // Strategy 1: Look for location in div.job-content-top-location
      const $locationDiv = $container.find('div.job-content-top-location').first();
      if ($locationDiv.length > 0) {
        // Try to find a link first (single location)
        const $locationLink = $locationDiv.find('a[href*="city="]').first();
        if ($locationLink.length > 0) {
          location = $locationLink.text().trim();
        } else {
          // If no link, try to extract from text after "מיקום המשרה:"
          const locationText = $locationDiv.text();
          const locationMatch = locationText.match(/מיקום\s*המשרה[^:：]*[:：]\s*([^\n\r]+)/i);
          if (locationMatch && locationMatch[1]) {
            location = locationMatch[1].trim();
            // Remove "מספר מקומות" if present
            location = location.replace(/מספר\s*מקומות/i, '').trim();
          }
          
          // If still empty, try to get all cities from job-regions-content
          if (!location || location.length < 2) {
            const $regionsContent = $locationDiv.find('div.job-regions-content');
            if ($regionsContent.length > 0) {
              const cities: string[] = [];
              $regionsContent.find('a').each((_, el) => {
                const city = $(el).text().trim();
                if (city) {
                  cities.push(city);
                }
              });
              if (cities.length > 0) {
                location = cities.join(', ');
              }
            }
          }
        }
      }
      
      // Strategy 2: Fallback - look for location link anywhere
      if (!location || location.length < 2) {
        const $locationLink = $container.find('a[href*="city="]').first();
        if ($locationLink.length > 0) {
          location = $locationLink.text().trim();
        }
      }

      // Extract job type - the correct selector is div.job-content-top-type
      let jobType = '';
      
      // Strategy 1: Look for job type in div.job-content-top-type
      const $jobTypeDiv = $container.find('div.job-content-top-type').first();
      if ($jobTypeDiv.length > 0) {
        const jobTypeText = $jobTypeDiv.text();
        const jobTypeMatch = jobTypeText.match(/סוג\s*משרה[^:：]*[:：]\s*([^\n\r]+)/i);
        if (jobTypeMatch && jobTypeMatch[1]) {
          jobType = jobTypeMatch[1].trim();
        }
      }
      
      // Strategy 2: Fallback - look in container text
      if (!jobType || jobType.length < 2) {
        const containerText = $container.text();
        const jobTypePatterns = [
          /סוג\s*משרה[^:：]*[:：]\s*([^\n\r]+)/i,
        ];
        
        for (const pattern of jobTypePatterns) {
          const match = containerText.match(pattern);
          if (match && match[1]) {
            jobType = match[1].trim();
            break;
          }
        }
      }

      // Extract description - the correct selector is div.job-content-top-desc
      let description = '';
      
      // Strategy 1: Look for description in div.job-content-top-desc (the main description)
      const $descriptionDiv = $container.find('div.job-content-top-desc.AR.RTL, div.job-content-top-desc').first();
      if ($descriptionDiv.length > 0) {
        // Get the first div inside (the actual description text)
        const $descContent = $descriptionDiv.find('div').first();
        if ($descContent.length > 0) {
          description = $descContent.text().trim();
        } else {
          description = $descriptionDiv.text().trim();
        }
        
        // Remove requirements section if it's included
        description = description.replace(/<div[^>]*class="PT15"[^>]*>.*?<\/div>/gi, '');
        description = description.replace(/דרישות:.*$/i, '').trim();
      }
      
      // Strategy 2: Fallback - get text from job-content-top-acord
      if (!description || description.length < 20) {
        const $acordDiv = $container.find('div.job-content-top-acord').first();
        if ($acordDiv.length > 0) {
          const $descInAcord = $acordDiv.find('div.job-content-top-desc').first();
          if ($descInAcord.length > 0) {
            description = $descInAcord.find('div').first().text().trim();
          }
        }
      }

      // Extract requirements - found in div.PT15 inside job-content-top-desc
      let requirements = '';
      
      // Strategy 1: Look for requirements in div.PT15
      const $requirementsDiv = $container.find('div.PT15').first();
      if ($requirementsDiv.length > 0) {
        const requirementsText = $requirementsDiv.text();
        const requirementsMatch = requirementsText.match(/דרישות[^:：]*[:：]\s*(.+)/is);
        if (requirementsMatch && requirementsMatch[1]) {
          requirements = requirementsMatch[1].trim();
          // Clean up - remove "המשרה מיועדת" text at the end
          requirements = requirements.replace(/המשרה\s*מיועדת.*$/i, '').trim();
        } else {
          // If no match, take all text after "דרישות:"
          requirements = requirementsText.replace(/^[^:：]*[:：]\s*/i, '').trim();
        }
      }
      
      // Strategy 2: Fallback - look in description text
      if (!requirements || requirements.length < 5) {
        const requirementsPatterns = [
          /דרישות[^:：]*[:：]\s*([^\n]+(?:\n[^\n]+)*)/is,
        ];
        
        const containerText = $container.text();
        for (const pattern of requirementsPatterns) {
          const match = containerText.match(pattern);
          if (match && match[1]) {
            requirements = match[1].trim();
            break;
          }
        }
      }

      // Construct absolute application URL
      const applicationUrl = href.startsWith('http')
        ? href
        : `${this.baseUrl}${href.startsWith('/') ? href : `/${href}`}`;

      // Fallback values if still empty
      if (!company || company.length < 2) {
        company = 'Unknown Company';
      }
      if (!location || location.length < 2) {
        location = 'Unknown Location';
      }
      if (!jobType || jobType.length < 2) {
        jobType = 'Unknown';
      }
      if (!description || description.length < 5) {
        description = title; // Use title as fallback description
      }

      const jobListing: JobListing = {
        jobId,
        title: title || 'Untitled',
        company,
        description,
        location,
        jobType,
        requirements: requirements || undefined,
        applicationUrl,
        companyId,
      };

      // Validate with Zod schema
      const result = JobListingSchema.safeParse(jobListing);
      if (!result.success) {
        this.logger.warn('Job listing validation failed', {
          jobId,
          errors: result.error.errors,
        });
        return null;
      }

      return result.data;
    } catch (error) {
      this.logger.error('Error parsing job listing', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

