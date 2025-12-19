import * as cheerio from 'cheerio';
import type { Logger } from '../../utils/logger';
import { JobListingSchema, type JobListing } from '../../types/JobListing';
import { JobSource } from '../../types/BaseJobListing';

/**
 * Parser for AllJobs job detail pages
 * Extracts job listing information from individual job pages
 */
export class JobDetailParser {
  private readonly logger: Logger;

  constructor(logger: Logger, _baseUrl: string = 'https://www.alljobs.co.il') {
    this.logger = logger;
  }

  /**
   * Parse a job detail page HTML and extract job listing data
   * @param html - HTML content of the job detail page
   * @param jobId - Job ID (from URL)
   * @param url - Full URL of the job page
   * @returns Parsed job listing or null if parsing fails
   */
  parseJobDetailPage(html: string, jobId: string, url: string): JobListing | null {
    try {
      const $ = cheerio.load(html);

      // IMPORTANT: Scope to main job container only (exclude similar jobs)
      // The main job is in #JobResult, similar jobs are in #divSimilarJobsContainer
      const $mainJobContainer = this.getMainJobContainer($, jobId);
      if (!$mainJobContainer || $mainJobContainer.length === 0) {
        this.logger.warn('Could not find main job container', { jobId });
        return null;
      }

      // Extract title - usually in h1 or specific header element
      let title = this.extractTitle($, $mainJobContainer);

      // Extract company
      const { company, companyId } = this.extractCompany($, $mainJobContainer);

      // Extract location
      const location = this.extractLocation($, $mainJobContainer);

      // Extract job type
      const jobType = this.extractJobType($, $mainJobContainer);

      // Extract categories (from sidebar, outside main job container)
      const category = this.extractCategories($, jobId);

      // Extract description
      const description = this.extractDescription($, $mainJobContainer);

      // Extract requirements
      const { requirements, targetAudience } = this.extractRequirements($, $mainJobContainer);

      // Construct the job listing
      const jobListing: JobListing = {
        jobId,
        title: title || 'Untitled',
        company: company || 'Unknown Company',
        description: description || title || 'No description available',
        location: location || 'Unknown Location',
        jobType: jobType || 'Unknown',
        category: category || undefined,
        requirements: requirements || undefined,
        targetAudience: targetAudience || undefined,
        applicationUrl: url,
        companyId: companyId || undefined,
        source: JobSource.ALLJOBS,
      };

      // Validate with Zod schema
      const result = JobListingSchema.safeParse(jobListing);
      if (!result.success) {
        this.logger.warn('Job listing validation failed', {
          jobId,
          errors: result.error.errors,
          title,
          company,
        });
        return null;
      }

      return result.data;
    } catch (error) {
      this.logger.error('Failed to parse job detail page', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get the main job container element, excluding similar/suggested jobs
   * @param $ - Cheerio instance
   * @param jobId - Job ID to find
   * @returns Cheerio selection of main job container
   */
  private getMainJobContainer($: cheerio.CheerioAPI, jobId: string): cheerio.Cheerio<any> | null {
    // Strategy 1: Look for the specific job box by ID in #JobResult only
    const $jobResult = $('#JobResult');
    if ($jobResult.length > 0) {
      // Try to find the specific job box
      const $jobBox = $jobResult.find(`#job-box-container${jobId}`);
      if ($jobBox.length > 0) {
        return $jobBox;
      }
      // If not found, return the entire JobResult (main job only)
      return $jobResult;
    }

    // Strategy 2: Find the job box by ID anywhere but NOT in similar jobs container
    const $jobBox = $(`#job-box-container${jobId}`).not('#divSimilarJobsContainer #job-box-container' + jobId);
    if ($jobBox.length > 0) {
      return $jobBox;
    }

    // Strategy 3: Look for job-box inside openboard-container-jobs but not in similar jobs
    const $openBoard = $('.openboard-container-jobs').first();
    if ($openBoard.length > 0) {
      const $firstJobBox = $openBoard.find('.job-box').first();
      if ($firstJobBox.length > 0) {
        return $firstJobBox.parent();
      }
    }

    // Strategy 4: Fallback - use page excluding similar jobs section
    // Clone the body and remove similar jobs section
    const $body = $('body').clone();
    $body.find('#divSimilarJobsContainer').remove();
    return $body;
  }

  /**
   * Extract job title from the page
   */
  private extractTitle($: cheerio.CheerioAPI, $container: cheerio.Cheerio<any>): string {
    // Strategy 1: Look for h2 inside job-content-top-title in the main container
    let title = $container.find('.job-content-top-title h2').first().text().trim();

    // Strategy 2: Look for title attribute in the job link
    if (!title) {
      const $titleLink = $container.find('.job-content-top-title a[title]').first();
      if ($titleLink.length > 0) {
        const titleAttr = $titleLink.attr('title') || '';
        // Title format is often "דרושים | Job Title" or "הצעות עבודה | Job Title"
        title = titleAttr.replace(/^(דרושים|הצעות עבודה|חיפוש עבודה)\s*\|\s*/i, '').trim();
      }
    }

    // Strategy 3: Look in breadcrumb (last part is usually the title)
    if (!title) {
      const $breadcrumb = $('h1').filter((_, el) => {
        const text = $(el).text();
        return text.includes('דרושים') && text.includes('»');
      }).first();
      if ($breadcrumb.length > 0) {
        const breadcrumbParts = $breadcrumb.text().split('»');
        if (breadcrumbParts.length > 0) {
          title = breadcrumbParts[breadcrumbParts.length - 1].trim();
        }
      }
    }

    // Strategy 4: Look in meta title
    if (!title) {
      const metaTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
      if (metaTitle) {
        // Often format is "Job Title | AllJobs"
        title = metaTitle.split('|')[0].trim();
      }
    }

    // Clean title
    title = title.replace(/דרושים\s*»\s*/g, '').trim();
    title = title.replace(/\s+/g, ' ').trim();

    return title;
  }

  /**
   * Extract company name and ID
   */
  private extractCompany($: cheerio.CheerioAPI, $container: cheerio.Cheerio<any>): { company: string; companyId?: string } {
    let company = '';
    let companyId: string | undefined;

    // Strategy 1: Look for company link in job-content-top-title div.T14 within container
    const $titleDiv = $container.find('.job-content-top-title');
    if ($titleDiv.length > 0) {
      const $companyLink = $titleDiv.find('div.T14 a[href*="Employer/HP"]').first();
      if ($companyLink.length > 0) {
        company = $companyLink.text().trim();
        const companyIdMatch = $companyLink.attr('href')?.match(/cid=(\d+)/);
        if (companyIdMatch) {
          companyId = companyIdMatch[1];
        }
      }
      // Check for "חברה חסויה" (confidential company)
      if (!company) {
        const titleText = $titleDiv.find('div.T14').text().trim();
        if (titleText.includes('חברה חסויה')) {
          company = 'חברה חסויה';
        }
      }
    }

    // Strategy 2: Look for company link with Employer/HP href within container
    if (!company) {
      const $companyLink = $container.find('a[href*="Employer/HP"]').first();
      if ($companyLink.length > 0) {
        company = $companyLink.text().trim();
        const companyIdMatch = $companyLink.attr('href')?.match(/cid=(\d+)/);
        if (companyIdMatch) {
          companyId = companyIdMatch[1];
        }
      }
    }

    // Strategy 3: Look for company name in structured data (page-level)
    if (!company) {
      const $structuredData = $('script[type="application/ld+json"]');
      if ($structuredData.length > 0) {
        try {
          const jsonText = $structuredData.first().html();
          if (jsonText) {
            const data = JSON.parse(jsonText);
            if (data.hiringOrganization?.name) {
              company = data.hiringOrganization.name;
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    return { company, companyId };
  }

  /**
   * Extract job location
   */
  private extractLocation($: cheerio.CheerioAPI, $container: cheerio.Cheerio<any>): string {
    const locations: string[] = [];

    // Strategy 1: Look in job-content-top-location div within container
    const $locationDiv = $container.find('div.job-content-top-location').first();
    if ($locationDiv.length > 0) {
      // First try to get location from visible text (before the dropdown)
      const locationText = $locationDiv.text();

      // Check if location is in main text (single location case)
      const singleLocationMatch = locationText.match(/מיקום\s*המשרה[^:：]*[:：]\s*([^\n\r]+)/i);
      if (singleLocationMatch && singleLocationMatch[1]) {
        const singleLoc = singleLocationMatch[1].trim().replace(/מספר\s*מקומות/i, '').trim();
        if (singleLoc.length > 2 && !singleLoc.includes('מספר')) {
          locations.push(singleLoc);
        }
      }

      // Get locations from links (more reliable)
      const $locationLinks = $locationDiv.find('a[href*="city="]');
      $locationLinks.each((_, el) => {
        const city = $(el).text().trim();
        if (city && !locations.includes(city)) {
          locations.push(city);
        }
      });

      // Also check the dropdown content for multiple locations
      const $regionsBox = $container.find('.job-regions-box .job-regions-content a');
      if ($regionsBox.length > 0 && locations.length === 0) {
        $regionsBox.each((_, el) => {
          const city = $(el).text().trim();
          if (city && !locations.includes(city)) {
            locations.push(city);
          }
        });
      }
    }

    // Strategy 2: Look for location text with pattern within container
    if (locations.length === 0) {
      const containerText = $container.text();
      const locationMatch = containerText.match(/מיקום\s*(?:המשרה)?[^:：]*[:：]\s*([^\n\r]+)/i);
      if (locationMatch && locationMatch[1]) {
        const locationText = locationMatch[1].trim().replace(/מספר\s*מקומות/i, '').trim();
        if (locationText.length > 2) {
          locations.push(locationText);
        }
      }
    }

    // Strategy 3: Look for any city links within container
    if (locations.length === 0) {
      $container.find('a[href*="city="]').each((_, el) => {
        const city = $(el).text().trim();
        if (city && city.length > 1 && !locations.includes(city)) {
          locations.push(city);
        }
      });
    }

    return locations.join(', ') || 'Unknown Location';
  }

  /**
   * Extract job type
   */
  private extractJobType($: cheerio.CheerioAPI, $container: cheerio.Cheerio<any>): string {
    const jobTypes: string[] = [];

    // Strategy 1: Look in job-content-top-type div within container
    const $jobTypeDiv = $container.find('div.job-content-top-type').first();
    if ($jobTypeDiv.length > 0) {
      // Get the text content, removing the label
      let jobTypeText = $jobTypeDiv.text().trim();

      // Remove the "סוג משרה:" prefix
      jobTypeText = jobTypeText.replace(/סוג\s*משרה\s*[:：]\s*/i, '').trim();

      // Handle multiple types (shown in dropdown)
      if (jobTypeText.includes('מספר סוגים')) {
        // Look for types in the dropdown
        const $typesBox = $container.find('.job-types-box .job-types-content div');
        if ($typesBox.length > 0) {
          $typesBox.each((_, el) => {
            const typeText = $(el).text().trim();
            if (typeText && !jobTypes.includes(typeText)) {
              jobTypes.push(typeText);
            }
          });
        }
      } else if (jobTypeText) {
        // Single job type - clean up and add
        // Remove extra whitespace and newlines
        jobTypeText = jobTypeText.replace(/\s+/g, ' ').trim();
        if (jobTypeText && !jobTypeText.match(/מספר\s*סוגים/i)) {
          jobTypes.push(jobTypeText);
        }
      }
    }

    // Strategy 2: Look in container text
    if (jobTypes.length === 0) {
      const containerText = $container.text();
      const patterns = [
        /סוג\s*משרה\s*[:：]\s*([^\n\r]+)/i,
        /Job\s*Type\s*[:：]\s*([^\n\r]+)/i,
      ];

      for (const pattern of patterns) {
        const match = containerText.match(pattern);
        if (match && match[1]) {
          let typeValue = match[1].trim();
          typeValue = this.translateJobType(typeValue);
          if (typeValue && !typeValue.match(/מספר\s*סוגים/i)) {
            // Clean up - take only the job type part, remove location info
            typeValue = typeValue.split(/מיקום/)[0].trim();
            if (typeValue) {
              jobTypes.push(typeValue);
            }
            break;
          }
        }
      }
    }

    return jobTypes.join(', ') || 'Unknown';
  }

  /**
   * Translate English job type to Hebrew
   */
  private translateJobType(jobType: string): string {
    const translations: Record<string, string> = {
      'Full Time': 'משרה מלאה',
      'Part Time': 'משרה חלקית',
      'Full Time and Hybrid work': 'משרה מלאה ועבודה היברידית',
      'Shifts': 'משמרות',
      'Temporary': 'עבודה זמנית',
      'Freelance': 'פרילאנס',
      'Contract': 'חוזה',
      'Permanent': 'קבוע',
    };
    return translations[jobType] || jobType;
  }

  /**
   * Extract categories
   */
  private extractCategories($: cheerio.CheerioAPI, jobId: string): string {
    const categories: string[] = [];

    // Strategy 1: Extract from CategoriesLinksOfJobSeoBox1_divJobCategoriesLinks
    const $categoryBox = $('div#CategoriesLinksOfJobSeoBox1_divJobCategoriesLinks');
    if ($categoryBox.length > 0) {
      // Primary category
      const $primaryLink = $categoryBox.find('a#CategoriesLinksOfJobSeoBox1_PLink');
      if ($primaryLink.length > 0) {
        const primaryCategory = $primaryLink.text().trim();
        if (primaryCategory && primaryCategory.length > 2) {
          categories.push(primaryCategory);
        }
      }

      // Secondary category
      const $secondaryLink = $categoryBox.find('a#CategoriesLinksOfJobSeoBox1_ChLink');
      if ($secondaryLink.length > 0) {
        const secondaryCategory = $secondaryLink.text().trim();
        if (secondaryCategory && secondaryCategory.length > 2 && !categories.includes(secondaryCategory)) {
          categories.push(secondaryCategory);
        }
      }

      // Tertiary categories
      const $tertiaryLinks = $categoryBox
        .find('a[id*="CategoriesLinksOfJobSeoBox1_"]')
        .not('#CategoriesLinksOfJobSeoBox1_PLink')
        .not('#CategoriesLinksOfJobSeoBox1_ChLink');
      $tertiaryLinks.each((_, el) => {
        const tertiaryText = $(el).text().trim();
        if (tertiaryText && tertiaryText.length > 2 && !categories.includes(tertiaryText)) {
          categories.push(tertiaryText);
        }
      });

      // Fallback: L_Orange links
      if (categories.length === 0) {
        const $orangeLinks = $categoryBox.find('a.L_Orange');
        $orangeLinks.each((_, el) => {
          const categoryText = $(el).text().trim();
          if (categoryText && categoryText.length > 2 && !categories.includes(categoryText)) {
            categories.push(categoryText);
          }
        });
      }
    }

    // Strategy 2: Extract from breadcrumb
    if (categories.length === 0) {
      const $breadcrumb = $('h1').filter((_, el) => {
        const text = $(el).text();
        return text.includes('דרושים') && text.includes('»');
      }).first();

      if ($breadcrumb.length > 0) {
        const $breadcrumbLinks = $breadcrumb.find('a[href*="position="]');
        if ($breadcrumbLinks.length > 0) {
          const categoryText = $breadcrumbLinks.eq(0).text().trim();
          if (this.isValidCategory(categoryText)) {
            categories.push(categoryText);
          }
        }
      }
    }

    // Strategy 3: Look for position links
    if (categories.length === 0) {
      $('a[href*="position="]').not('a[href*="city="]').each((_, el) => {
        const linkText = $(el).text().trim();
        const href = $(el).attr('href') || '';

        if (this.isValidCategory(linkText) && !href.includes('city=') && !href.includes('type=')) {
          if (!categories.includes(linkText)) {
            categories.push(linkText);
          }
        }
      });
    }

    if (categories.length > 0) {
      this.logger.debug('Extracted categories', { jobId, categories });
    }

    return categories.join(', ');
  }

  /**
   * Check if text is a valid category (not location or job type)
   */
  private isValidCategory(text: string): boolean {
    if (!text || text.length < 3 || text.length > 100) {
      return false;
    }

    // Skip locations
    const locationPattern = /^(מיקום|ראש|תל|חיפה|ירושלים|באר|נתניה|צפון|דרום|מרכז|גוש|אזור|שפלה|שרון|קרית|אשדוד|רמת|רעננה|חולון|בת|ים|גבעתיים|פתח|תקווה)/i;
    if (locationPattern.test(text)) {
      return false;
    }

    // Skip job types
    const jobTypePattern = /^(סוג|משרה|Job|Type|מספר|מקומות|סוגים|חלקית|מלאה|משמרות)/i;
    if (jobTypePattern.test(text)) {
      return false;
    }

    // Skip common non-categories
    if (text.match(/^(דרושים|כל\s*החברות|הגש\s*מועמדות|שמור\s*משרה)$/i)) {
      return false;
    }

    return true;
  }

  /**
   * Extract job description
   */
  private extractDescription($: cheerio.CheerioAPI, $container: cheerio.Cheerio<any>): string {
    // Strategy 1: Look in job-content-top-desc div within container
    const $descDiv = $container.find('div.job-content-top-desc.AR.RTL, div.job-content-top-desc').first();
    if ($descDiv.length > 0) {
      const $descContent = $descDiv.find('> div').first();
      let description = $descContent.length > 0 ? $descContent.html() || '' : $descDiv.html() || '';

      // Convert HTML to text while preserving line breaks
      description = description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

      // Remove the requirements section from description
      const reqIndex = description.indexOf('דרישות:');
      if (reqIndex > 0) {
        description = description.substring(0, reqIndex).trim();
      }

      // Clean up extra whitespace
      description = description.replace(/\n{3,}/g, '\n\n').trim();

      if (description.length > 20) {
        return description;
      }
    }

    // Strategy 2: Look in job-content-top-acord within container
    const $acordDiv = $container.find('div.job-content-top-acord div.job-content-top-desc').first();
    if ($acordDiv.length > 0) {
      const $descContent = $acordDiv.find('> div').first();
      let description = $descContent.length > 0 ? $descContent.html() || '' : $acordDiv.html() || '';

      // Convert HTML to text
      description = description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

      // Remove requirements section
      const reqIndex = description.indexOf('דרישות:');
      if (reqIndex > 0) {
        description = description.substring(0, reqIndex).trim();
      }

      if (description.length > 20) {
        return description;
      }
    }

    // Strategy 3: Look for job description meta (page-level)
    const ogDescription = $('meta[property="og:description"]').attr('content');
    if (ogDescription && ogDescription.length > 20) {
      return ogDescription;
    }

    return '';
  }

  /**
   * Extract requirements and target audience
   */
  private extractRequirements(_$: cheerio.CheerioAPI, $container: cheerio.Cheerio<any>): { requirements: string; targetAudience: string } {
    let requirements = '';
    let targetAudience = '';

    // Strategy 1: Look in div.PT15 within container (standard requirements block)
    const $requirementsDiv = $container.find('div.PT15').first();
    if ($requirementsDiv.length > 0) {
      let html = $requirementsDiv.html() || '';

      // Convert HTML to text while preserving line breaks
      let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

      // Extract requirements (everything after "דרישות:")
      const requirementsMatch = text.match(/דרישות\s*[:：]\s*(.+)/is);
      if (requirementsMatch && requirementsMatch[1]) {
        let fullRequirements = requirementsMatch[1].trim();

        // Extract target audience
        const targetMatch = fullRequirements.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
        if (targetMatch && targetMatch[1]) {
          targetAudience = targetMatch[1].trim();
          requirements = fullRequirements.replace(targetMatch[1], '').trim();
        } else {
          requirements = fullRequirements;
        }

        // Clean up extra whitespace
        requirements = requirements.replace(/\n{3,}/g, '\n\n').trim();
      }
    }

    // Strategy 2: Search in container text (for non-standard layouts)
    if (!requirements) {
      const $descDiv = $container.find('div.job-content-top-desc').first();
      if ($descDiv.length > 0) {
        let html = $descDiv.html() || '';

        // Convert HTML to text
        let text = html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();

        const requirementsMatch = text.match(/דרישות\s*[:：]\s*(.+)/is);
        if (requirementsMatch && requirementsMatch[1]) {
          let fullRequirements = requirementsMatch[1].trim();

          // Extract target audience
          const targetMatch = fullRequirements.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
          if (targetMatch && targetMatch[1]) {
            targetAudience = targetMatch[1].trim();
            requirements = fullRequirements.replace(targetMatch[1], '').trim();
          } else {
            requirements = fullRequirements;
          }

          requirements = requirements.replace(/\n{3,}/g, '\n\n').trim();
        }
      }
    }

    // Strategy 3: Look for target audience specifically within container
    if (!targetAudience) {
      const containerText = $container.text();
      const targetMatch = containerText.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
      if (targetMatch && targetMatch[1]) {
        targetAudience = targetMatch[1].trim();
      }
    }

    // Clean up requirements - remove target audience if still present
    if (requirements) {
      requirements = requirements.replace(/(המשרה\s*מיועדת[^.]*\.?)/gi, '').trim();
    }

    return { requirements, targetAudience };
  }
}
