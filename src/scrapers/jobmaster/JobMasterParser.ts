import * as cheerio from 'cheerio';
import { BaseParser } from '../base/BaseParser';
import type { Logger } from '../../utils/logger';
import { JobMasterJobListingSchema, type JobMasterJobListing } from '../../types/JobMasterJobListing';
import { JobSource } from '../../types/BaseJobListing';
import type { Element } from 'domhandler';

/**
 * Parser for extracting job listings from jobmaster.co.il HTML
 * Extends BaseParser with JobMaster-specific parsing logic
 */
export class JobMasterParser extends BaseParser {
  /**
   * Creates a new JobMasterParser instance
   * @param logger - Logger instance
   * @param baseUrl - Base URL of the website
   */
  constructor(logger: Logger, baseUrl: string = 'https://www.jobmaster.co.il') {
    super(logger, baseUrl);
  }

  /**
   * Parses job listings from HTML content
   * @param html - HTML content to parse
   * @param pageUrl - URL of the page being parsed
   * @returns Array of parsed job listings
   */
  parseJobListings(html: string, _pageUrl: string): JobMasterJobListing[] {
    try {
      const $ = cheerio.load(html);
      const jobs: JobMasterJobListing[] = [];

      // JobMaster uses article.CardStyle.JobItem structure
      // Primary selector: article with classes CardStyle and JobItem
      let $jobContainers = $('article.CardStyle.JobItem, article.JobItem');

      // If no articles found, try finding by container classes
      if ($jobContainers.length === 0) {
        $jobContainers = $('.ul_results_list article, .ul_results_wrap article, .results-list article');
      }

      // If still nothing, try div containers
      if ($jobContainers.length === 0) {
        $jobContainers = $('.JobItemRight, div[class*="JobItem"], div[class*="job-item"], div[class*="job-card"]');
      }

      // Last resort: look for any element with job-related links
      if ($jobContainers.length === 0) {
        // Try to find job links directly - exclude pagination links
        const $jobLinks = $('a[href*="checknum"], a[href*="/jobs/checknum"], a[href*="key="]')
          .not('a[href*="currPage"]')
          .not('a[href*="pagination"]')
          .not('a.paging')
          .not('a.paginationNext');
        
        this.logger.info('Trying to find job links directly', {
          jobLinksFound: $jobLinks.length,
          pageUrl: _pageUrl,
        });
        
        if ($jobLinks.length > 0) {
          // Create a new set of containers from the links
          const containers: Element[] = [];
          $jobLinks.each((_, linkElement) => {
            if (linkElement.type === 'tag') {
              const $link = $(linkElement as Element);
              // Try multiple parent selectors
              let $closest = $link.closest('article, div[class*="job"], div[class*="Job"], li, tr, div[class*="card"], div[class*="item"]');
              if ($closest.length === 0) {
                $closest = $link.parent();
              }
              if ($closest.length > 0) {
                const container = $closest.get(0);
                if (container && container.type === 'tag' && containers.indexOf(container as Element) === -1) {
                  containers.push(container as Element);
                }
              }
            }
          });
          if (containers.length > 0) {
            $jobContainers = $(containers);
            this.logger.info('Created containers from job links', {
              containersCreated: containers.length,
              jobLinksUsed: $jobLinks.length,
            });
          }
        }
      }

      this.logger.info('Found potential job containers', {
        count: $jobContainers.length,
        pageUrl: _pageUrl,
        htmlLength: html.length,
        hasArticles: $('article').length,
        hasJobLinks: $('a[href*="checknum"], a[href*="/jobs/checknum"], a[href*="key="]').length,
        hasResultsList: $('.ul_results_list, .ul_results_wrap').length,
      });

      // If we still have no containers, try even more aggressive selectors
      if ($jobContainers.length === 0) {
        // Try finding by any link that might be a job link
        const $allJobLinks = $('a[href*="checknum"], a[href*="/jobs/checknum"], a[href*="key="], a[href*="/jobs/"]').not('a[href*="currPage"]');
        if ($allJobLinks.length > 0) {
          this.logger.info('Found job links directly, creating containers', {
            linksFound: $allJobLinks.length,
            pageUrl: _pageUrl,
          });
          // Create containers from links
          const containers: Element[] = [];
          $allJobLinks.each((_, linkElement) => {
            if (linkElement.type === 'tag') {
              const $link = $(linkElement as Element);
              // Try to find parent container
              let $parent = $link.closest('article, div[class*="job"], div[class*="Job"], div[class*="card"], li, tr');
              if ($parent.length === 0) {
                $parent = $link.parent();
              }
              if ($parent.length > 0) {
                const parent = $parent.get(0);
                if (parent && parent.type === 'tag' && containers.indexOf(parent as Element) === -1) {
                  containers.push(parent as Element);
                }
              }
            }
          });
          if (containers.length > 0) {
            $jobContainers = $(containers);
            this.logger.info('Created containers from job links', {
              containersCreated: containers.length,
            });
          }
        }
      }

      // Log HTML structure for debugging if still no containers
      if ($jobContainers.length === 0) {
        this.logger.warn('No job containers found, checking HTML structure', {
          pageUrl: _pageUrl,
          hasResultsList: $('.ul_results_list, .ul_results_wrap').length > 0,
          hasArticles: $('article').length > 0,
          hasJobLinks: $('a[href*="checknum"], a[href*="/jobs/"]').length > 0,
          totalLinks: $('a').length,
          htmlLength: html.length,
        });
      }

      $jobContainers.each((_, element: Element) => {
        const $container = $(element);
        
        // Find the job link - JobMaster uses a.CardHeader.View_Job_Details
        // This is the PRIMARY selector based on actual website structure
        let $link: cheerio.Cheerio<Element> | null = null;
        const $foundLink = $container.find('a.CardHeader.View_Job_Details').first();
        if ($foundLink.length > 0) {
          $link = $foundLink as cheerio.Cheerio<Element>;
        }
        
        // Fallback: try other selectors
        if (!$link || $link.length === 0) {
          const $foundLink2 = $container.find('a.View_Job_Details').first();
          if ($foundLink2.length > 0) {
            $link = $foundLink2 as cheerio.Cheerio<Element>;
          }
        }
        
        // Fallback: find any link with href containing checknum
        if (!$link || $link.length === 0) {
          const $foundLink3 = $container.find('a[href*="checknum"], a[href*="/jobs/checknum"], a[href*="key="]').first();
          if ($foundLink3.length > 0) {
            $link = $foundLink3 as cheerio.Cheerio<Element>;
          }
        }
        
        // If still no link, check if the container itself is a link
        if ((!$link || $link.length === 0) && $container.is('a')) {
          const href = $container.attr('href');
          if (href && (href.includes('checknum') || href.includes('/jobs/'))) {
            $link = $container as cheerio.Cheerio<Element>;
          }
        }
        
        // If container has no direct link, try parent
        if (!$link || $link.length === 0) {
          const $parentLink = $container.closest('a[href*="checknum"], a[href*="/jobs/checknum"], a[href*="key="]');
          if ($parentLink.length > 0) {
            $link = $parentLink.first() as cheerio.Cheerio<Element>;
          }
        }
        
        // If still no link, check if container itself is a link
        if ((!$link || $link.length === 0) && $container.is('a')) {
          const href = $container.attr('href');
          if (href && (href.includes('checknum') || href.includes('/jobs/') || href.includes('key='))) {
            $link = $container as cheerio.Cheerio<Element>;
          }
        }
        
        if ($link && $link.length > 0) {
          const job = this.parseJobListing(html, $link, _pageUrl);
          if (job) {
            jobs.push(job);
          } else {
            this.logger.debug('Failed to parse job from link', {
              href: $link.attr('href'),
              linkText: $link.text().substring(0, 50),
            });
          }
        } else {
          this.logger.debug('Skipping container - no job link found', {
            containerHtml: $container.html()?.substring(0, 200),
            containerTag: $container.prop('tagName'),
            containerClasses: $container.attr('class'),
          });
        }
      });

      this.logger.info('Parsed job listings', {
        count: jobs.length,
        containersFound: $jobContainers.length,
        pageUrl: _pageUrl,
      });

      return jobs;
    } catch (error) {
      this.logger.error('Failed to parse job listings', {
        error: error instanceof Error ? error.message : String(error),
        pageUrl: _pageUrl,
      });
      return [];
    }
  }

  /**
   * Fetches and parses full job details from individual job page
   * @param jobUrl - URL of the individual job page
   * @param httpClient - HTTP client for making requests
   * @returns Full job details or null if failed
   */
  async parseFullJobDetails(
    jobUrl: string,
    httpClient: any
  ): Promise<Partial<JobMasterJobListing> | null> {
    try {
      const response = await httpClient.get(jobUrl);
      const $ = cheerio.load(response.data);
      
      // Extract category from breadcrumb
      let category = '';
      const $breadcrumb = $('nav[aria-label="breadcrumb"] ol li, .breadcrumb li, ul.breadcrumb li, nav ol li, main list listitem');
      if ($breadcrumb.length > 0) {
        const categories: string[] = [];
        $breadcrumb.each((_, el) => {
          const $link = $(el).find('a');
          if ($link.length > 0) {
            const href = $link.attr('href') || '';
            const text = $link.text().trim();
            // Skip "דרושים" and empty texts
            if (text && text !== 'דרושים' && text !== '›' && href.includes('/jobs/?q=')) {
              categories.push(text);
            }
          }
        });
        if (categories.length > 0) {
          category = categories.join(', ');
        }
      }
      
      // Extract "מתאים ל" (target audience) from description
      let targetAudience = '';
      const fullText = $('main, article, .job-content, .job-details').text();
      const targetAudienceMatch = fullText.match(/מתאים ל:\s*([^\n]+)/);
      if (targetAudienceMatch) {
        targetAudience = targetAudienceMatch[1].trim();
      }
      
      // Extract full description from job detail page
      let fullDescription = '';
      
      // Try multiple selectors for full description
      const descriptionSelectors = [
        '.jobDescription',
        '.job-description',
        '.JobDescription',
        '#jobDescription',
        '[class*="description"]',
        '.job-content',
        '.job-details',
        '.jobFullDescription',
      ];
      
      for (const selector of descriptionSelectors) {
        const $desc = $(selector).first();
        if ($desc.length > 0) {
          fullDescription = $desc.text().trim();
          if (fullDescription.length > 50) break;
        }
      }
      
      // If no specific description element, try to get all text from main content area
      if (!fullDescription || fullDescription.length < 50) {
        const $mainContent = $('.job-content, .job-details, .main-content, [class*="content"]').first();
        if ($mainContent.length > 0) {
          fullDescription = $mainContent.text().trim();
        }
      }
      
      // Extract full requirements
      let fullRequirements = '';
      const requirementsSelectors = [
        '.jobRequirements',
        '.job-requirements',
        '.JobRequirements',
        '#jobRequirements',
        '[class*="requirement"]',
        '[class*="דרישות"]',
      ];
      
      for (const selector of requirementsSelectors) {
        const $req = $(selector).first();
        if ($req.length > 0) {
          fullRequirements = $req.text().trim();
          if (fullRequirements.length > 20) break;
        }
      }
      
      // Look for requirements in structured format
      if (!fullRequirements || fullRequirements.length < 20) {
        // Try to find requirements section
        const $reqSection = $('*:contains("דרישות"), *:contains("דרוש"), *:contains("Requirements")').first();
        if ($reqSection.length > 0) {
          const $reqList = $reqSection.next('ul, ol, div');
          if ($reqList.length > 0) {
            fullRequirements = $reqList.text().trim();
          } else {
            fullRequirements = $reqSection.text().trim();
          }
        }
      }
      
      return {
        description: fullDescription || undefined,
        requirements: fullRequirements || undefined,
        category: category || undefined,
        targetAudience: targetAudience || undefined,
      };
    } catch (error) {
      this.logger.debug('Failed to fetch full job details', {
        url: jobUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Parses a single job listing from HTML element
   * @param html - HTML content containing the job listing
   * @param $link - Cheerio element containing job link
   * @param pageUrl - URL of the page being parsed
   * @returns Parsed job listing or null if parsing fails
   */
  protected parseJobListing(
    _html: string,
    $link: cheerio.Cheerio<Element>,
    _pageUrl: string
  ): JobMasterJobListing | null {
    try {
      const href = $link.attr('href') || '';

      // Extract job ID from URL - JobMaster URLs have format /jobs/checknum.asp?key=XXXXX
      let jobId = '';
      const keyMatch = href.match(/key[=:](\d+)|checknum[^?]*\?.*key[=:](\d+)/);
      if (keyMatch) {
        jobId = keyMatch[1] || keyMatch[2];
      }

      // Alternative: extract from article id (misraXXXXX) - JobMaster uses this format
      if (!jobId) {
        const $article = $link.closest('article[id^="misra"]');
        if ($article.length > 0) {
          const articleId = $article.attr('id') || '';
          const misraMatch = articleId.match(/misra(\d+)/);
          if (misraMatch) {
            jobId = misraMatch[1];
          }
        }
      }

      // Alternative: extract from data-selector attribute (View_Job_Details_XXXXX)
      if (!jobId) {
        const $jobItemRight = $link.closest('.JobItemRight');
        if ($jobItemRight.length > 0) {
          const dataSelector = $jobItemRight.attr('data-selector') || '';
          const selectorMatch = dataSelector.match(/View_Job_Details_(\d+)/);
          if (selectorMatch) {
            jobId = selectorMatch[1];
          }
        }
      }

      // If no job ID found, try to extract from data attributes
      if (!jobId) {
        jobId = $link.attr('data-job-id') || $link.attr('data-id') || $link.closest('[data-job-id]').attr('data-job-id') || '';
      }

      // Last resort: extract any numeric ID from URL
      if (!jobId) {
        const numericMatch = href.match(/(\d{5,})/);
        if (numericMatch) {
          jobId = numericMatch[1];
        }
      }

      if (!jobId) {
        // Skip if we can't identify the job
        this.logger.debug('Skipping job - no ID found', { href });
        return null;
      }

      // Find the job container - JobMaster uses article.CardStyle.JobItem structure
      // Primary: article with CardStyle and JobItem classes (this is the main container)
      let $container = $link.closest('article.CardStyle.JobItem, article.JobItem').first();
      if ($container.length === 0) {
        $container = $link.closest('article.CardStyle, article[class*="JobItem"]').first();
      }
      // Fallback: JobItemRight div (inside the article)
      if ($container.length === 0) {
        $container = $link.closest('.JobItemRight').first();
        // If we found JobItemRight, get its parent article
        if ($container.length > 0) {
          const $article = $container.closest('article');
          if ($article.length > 0) {
            $container = $article;
          }
        }
      }
      if ($container.length === 0) {
        $container = $link.closest('.ul_results_list > article, .ul_results_wrap > article').first();
      }
      if ($container.length === 0) {
        $container = $link.closest('div[class*="JobItem"], div[class*="result"], div[class*="job"], div[class*="card"]').first();
      }
      if ($container.length === 0) {
        $container = $link.parent().parent(); // Try parent's parent
      }
      if ($container.length === 0) {
        $container = $link.parent();
      }

      // Extract title - usually in the link text or a heading nearby
      let title = $link.text().trim();
      if (!title || title.length < 3) {
        title = $container.find('h1, h2, h3, h4, [class*="title"], [class*="Title"], .JobItemTitle').first().text().trim();
      }
      if (!title || title.length < 3) {
        title = $link.find('span, div').first().text().trim();
      }

      // Extract company - JobMaster uses a.CompanyNameLink or a[href*="checkhevra"]
      let company = '';
      const $companyElement = $container.find('a.CompanyNameLink, a[href*="checkhevra"], .CompanyNameLink span').first();
      if ($companyElement.length > 0) {
        company = $companyElement.text().trim();
        // If it's a span inside the link, get the span text
        if (!company || company.length < 2) {
          company = $companyElement.find('span').first().text().trim() || $companyElement.text().trim();
        }
      }
      
      // Fallback: look for company in JobExtraInfo area
      if (!company || company.length < 2) {
        const $companyFallback = $container.find('.JobExtraInfo a, [class*="company"], [class*="Company"]').first();
        if ($companyFallback.length > 0) {
          company = $companyFallback.text().trim();
        }
      }

      // Extract location - JobMaster uses li.jobLocation with span inside
      let location = '';
      const $locationElement = $container.find('li.jobLocation span, li.jobLocation').first();
      if ($locationElement.length > 0) {
        location = $locationElement.text().trim();
      }
      
      // Fallback: look in JobExtraInfo
      if (!location || location.length < 2) {
        const $locationFallback = $container.find('.JobExtraInfo li[class*="location"], [class*="location"], [class*="Location"]').first();
        if ($locationFallback.length > 0) {
          const locationText = $locationFallback.text().trim();
          // Common Israeli cities pattern
          const locationMatch = locationText.match(/(תל אביב|ירושלים|חיפה|באר שבע|רמת גן|גבעתיים|רעננה|הרצליה|נתניה|אשדוד|ראשון לציון|רחובות|רמת השרון|בני ברק)/);
          if (locationMatch) {
            location = locationMatch[1];
          } else {
            location = locationText.split(/[|•]/)[0].trim();
          }
        }
      }

      // Extract job type - JobMaster uses li.jobType
      let jobType = '';
      const $jobTypeElement = $container.find('li.jobType').first();
      if ($jobTypeElement.length > 0) {
        jobType = $jobTypeElement.text().trim();
      }
      
      // Fallback: look for job type in other places
      if (!jobType || jobType.length < 2) {
        const $jobTypeFallback = $container.find('[class*="type"], [class*="Type"], [class*="job-type"]').first();
        if ($jobTypeFallback.length > 0) {
          jobType = $jobTypeFallback.text().trim();
        }
      }

      // Extract description - JobMaster uses div.jobShortDescription
      let description = '';
      const $descriptionElement = $container.find('div.jobShortDescription').first();
      if ($descriptionElement.length > 0) {
        description = $descriptionElement.text().trim();
      }
      
      // Fallback: look for description in other places
      if (!description || description.length < 5) {
        const $descriptionFallback = $container.find('[class*="description"], [class*="Description"], [class*="desc"]').first();
        if ($descriptionFallback.length > 0) {
          description = $descriptionFallback.text().trim();
        }
      }

      // Extract requirements - JobMaster might have requirements in multiple places
      let requirements = '';
      
      // Strategy 1: Look for dedicated requirements element
      const $requirementsElement = $container.find('[class*="requirement"], [class*="Requirement"], [class*="qualification"], [class*="דרישות"]').first();
      if ($requirementsElement.length > 0) {
        requirements = $requirementsElement.text().trim();
      }
      
      // Strategy 2: Look for requirements in description text using patterns
      if (!requirements || requirements.length < 5) {
        const containerText = $container.text();
        const descriptionText = description || containerText;
        
        // Try multiple patterns to find requirements
        const requirementsPatterns = [
          /דרישות[^:：]*[:：]\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:המשרה|תיאור|מיקום|סוג|$))/is,
          /דרישות[^:：]*[:：]\s*(.+?)(?=\n\s*(?:המשרה|תיאור|מיקום|סוג|$))/is,
          /דרישות[^:：]*[:：]\s*(.+)/is,
          /דרוש[^:：]*[:：]\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:המשרה|תיאור|מיקום|סוג|$))/is,
          /דרוש[^:：]*[:：]\s*(.+)/is,
        ];
        
        for (const pattern of requirementsPatterns) {
          const match = descriptionText.match(pattern);
          if (match && match[1]) {
            requirements = match[1].trim();
            // Clean up - remove common trailing text
            requirements = requirements.replace(/המשרה\s*מיועדת.*$/i, '').trim();
            requirements = requirements.replace(/תיאור.*$/i, '').trim();
            if (requirements.length >= 5) {
              break;
            }
          }
        }
      }
      
      // Strategy 3: Look in specific JobMaster classes
      if (!requirements || requirements.length < 5) {
        const $reqDiv = $container.find('.JobRequirements, .job-requirements, [class*="Req"]').first();
        if ($reqDiv.length > 0) {
          requirements = $reqDiv.text().trim();
        }
      }
      
      // Strategy 4: Look for bullet points or lists that might contain requirements
      if (!requirements || requirements.length < 5) {
        const $reqList = $container.find('ul[class*="requirement"], ul[class*="Req"], ol[class*="requirement"]').first();
        if ($reqList.length > 0) {
          requirements = $reqList.text().trim();
        }
      }
      
      // Strategy 5: Extract from description if it contains "דרישות" keyword
      if ((!requirements || requirements.length < 5) && description) {
        const descLines = description.split('\n');
        let foundRequirements = false;
        const reqLines: string[] = [];
        
        for (let i = 0; i < descLines.length; i++) {
          const line = descLines[i].trim();
          if (line.match(/דרישות|דרוש/)) {
            foundRequirements = true;
            // Extract text after "דרישות:" or "דרוש:"
            const reqMatch = line.match(/דרישות[^:：]*[:：]\s*(.+)|דרוש[^:：]*[:：]\s*(.+)/i);
            if (reqMatch && (reqMatch[1] || reqMatch[2])) {
              reqLines.push((reqMatch[1] || reqMatch[2]).trim());
            }
          } else if (foundRequirements && line.length > 0) {
            // Continue collecting requirements until we hit another section
            if (line.match(/תיאור|מיקום|סוג|חברה|המשרה\s*מיועדת/i)) {
              break;
            }
            reqLines.push(line);
          }
        }
        
        if (reqLines.length > 0) {
          requirements = reqLines.join(' ').trim();
        }
      }

      // Fallback values
      if (!title || title.length < 3) {
        title = 'Untitled';
      }
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

      const applicationUrl = href.startsWith('http')
        ? href
        : `${this.baseUrl}${href.startsWith('/') ? href : `/${href}`}`;

      const jobListing: JobMasterJobListing = {
        jobId,
        title,
        company,
        description,
        location,
        jobType,
        requirements: requirements || undefined,
        applicationUrl,
        companyId: $companyElement.attr('href')?.match(/[cC]ompany[Ii]d[=:](\d+)|[cC]id[=:](\d+)/)?.[1] || undefined,
        source: JobSource.JOBMASTER,
      };

      // Validate with Zod schema
      const result = JobMasterJobListingSchema.safeParse(jobListing);
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

