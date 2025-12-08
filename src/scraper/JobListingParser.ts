import * as cheerio from 'cheerio';
import type { Logger } from '../utils/logger';
import { JobListingSchema, type JobListing } from '../types/JobListing';
import { JobSource } from '../types/BaseJobListing';
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
   * Parses a job detail page HTML to extract all categories
   * Extracts primary, secondary, and tertiary categories from the category box
   * @param html - HTML content of the job detail page
   * @param jobId - Job ID for logging purposes
   * @returns Object with categories array and other extracted data
   */
  parseJobDetailPage(html: string, jobId: string): {
    categories: string[];
    fullDescription?: string;
    fullRequirements?: string;
  } {
    try {
      const $ = cheerio.load(html);
      const categories: string[] = [];

      // Strategy: Extract from CategoriesLinksOfJobSeoBox1_divJobCategoriesLinks (most reliable)
      const $categoryBox = $('div#CategoriesLinksOfJobSeoBox1_divJobCategoriesLinks');
      if ($categoryBox.length > 0) {
        // Extract primary category from CategoriesLinksOfJobSeoBox1_PLink
        const $primaryCategoryLink = $categoryBox.find('a#CategoriesLinksOfJobSeoBox1_PLink');
        if ($primaryCategoryLink.length > 0) {
          const primaryCategoryText = $primaryCategoryLink.text().trim();
          if (primaryCategoryText && primaryCategoryText.length > 2) {
            categories.push(primaryCategoryText);
            this.logger.debug('Found primary category from CategoriesLinksOfJobSeoBox1_PLink', {
              jobId,
              category: primaryCategoryText,
            });
          }
        }

        // Extract secondary category from CategoriesLinksOfJobSeoBox1_ChLink
        const $secondaryCategoryLink = $categoryBox.find('a#CategoriesLinksOfJobSeoBox1_ChLink');
        if ($secondaryCategoryLink.length > 0) {
          const secondaryCategoryText = $secondaryCategoryLink.text().trim();
          if (secondaryCategoryText && secondaryCategoryText.length > 2 && !categories.includes(secondaryCategoryText)) {
            categories.push(secondaryCategoryText);
            this.logger.debug('Found secondary category from CategoriesLinksOfJobSeoBox1_ChLink', {
              jobId,
              category: secondaryCategoryText,
            });
          }
        }

        // Extract tertiary categories from all other links in category box
        const $tertiaryLinks = $categoryBox
          .find('a[id*="CategoriesLinksOfJobSeoBox1_"]')
          .not('#CategoriesLinksOfJobSeoBox1_PLink')
          .not('#CategoriesLinksOfJobSeoBox1_ChLink');
        
        $tertiaryLinks.each((_, el) => {
          const tertiaryText = $(el).text().trim();
          if (tertiaryText && tertiaryText.length > 2 && !categories.includes(tertiaryText)) {
            categories.push(tertiaryText);
            this.logger.debug('Found tertiary category', {
              jobId,
              category: tertiaryText,
            });
          }
        });

        // Fallback: Get all L_Orange links in the category box (if IDs not found)
        if (categories.length === 0) {
          const $orangeLinks = $categoryBox.find('a.L_Orange');
          if ($orangeLinks.length > 0) {
            $orangeLinks.each((_, el) => {
              const categoryText = $(el).text().trim();
              if (categoryText && categoryText.length > 2 && !categories.includes(categoryText)) {
                categories.push(categoryText);
              }
            });
            this.logger.debug('Found categories from L_Orange links', {
              jobId,
              categories,
            });
          }
        }
      }

      // Extract full description if available
      const fullDescription = $('.job-description, .JobDescription, #jobDescription, [class*="description"]')
        .first()
        .text()
        .trim() || undefined;

      // Extract full requirements if available
      const fullRequirements = $('.job-requirements, .JobRequirements, [class*="requirement"]')
        .first()
        .text()
        .trim() || undefined;

      return {
        categories,
        fullDescription,
        fullRequirements,
      };
    } catch (error) {
      this.logger.error('Failed to parse job detail page', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { categories: [] };
    }
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

      // Extract location - COMPREHENSIVE: Get ALL locations, not just first
      let location = '';
      const locations: string[] = [];
      
      // Strategy 1: Look for location in div.job-content-top-location
      const $locationDiv = $container.find('div.job-content-top-location').first();
      if ($locationDiv.length > 0) {
        // Get ALL location links (not just first)
        const $locationLinks = $locationDiv.find('a[href*="city="]');
        if ($locationLinks.length > 0) {
          $locationLinks.each((_, el) => {
            const city = $(el).text().trim();
            if (city && !locations.includes(city)) {
              locations.push(city);
            }
          });
        }
        
        // Also try to get all cities from job-regions-content
        const $regionsContent = $locationDiv.find('div.job-regions-content');
        if ($regionsContent.length > 0) {
          $regionsContent.find('a').each((_, el) => {
            const city = $(el).text().trim();
            if (city && !locations.includes(city)) {
              locations.push(city);
            }
          });
        }
        
        // If no links found, try to extract from text
        if (locations.length === 0) {
          const locationText = $locationDiv.text();
          const locationMatch = locationText.match(/מיקום\s*המשרה[^:：]*[:：]\s*([^\n\r]+)/i);
          if (locationMatch && locationMatch[1]) {
            let locationTextValue = locationMatch[1].trim();
            // Remove "מספר מקומות" if present but keep the actual locations
            locationTextValue = locationTextValue.replace(/מספר\s*מקומות/i, '').trim();
            if (locationTextValue && locationTextValue.length > 2) {
              // Split by common separators if multiple locations
              const splitLocations = locationTextValue.split(/[,;|]/).map(l => l.trim()).filter(l => l.length > 0);
              if (splitLocations.length > 0) {
                locations.push(...splitLocations);
              } else {
                locations.push(locationTextValue);
              }
            }
          }
        }
      }
      
      // Strategy 2: Fallback - look for ALL location links anywhere in container
      if (locations.length === 0) {
        const $allLocationLinks = $container.find('a[href*="city="]');
        $allLocationLinks.each((_, el) => {
          const city = $(el).text().trim();
          if (city && !locations.includes(city)) {
            locations.push(city);
          }
        });
      }
      
      // Join all locations
      if (locations.length > 0) {
        location = locations.join(', ');
      }
      
      // Translate common English location terms to Hebrew
      const locationTranslations: Record<string, string> = {
        'More than one': 'מספר מקומות',
        'Multiple locations': 'מספר מקומות',
        'Various locations': 'מספר מקומות',
      };
      if (location && locationTranslations[location]) {
        location = locationTranslations[location];
      }

      // Extract job type - COMPREHENSIVE: Get ALL job types, not just first
      let jobType = '';
      const jobTypes: string[] = [];
      
      // Strategy 1: Look for job type in div.job-content-top-type
      const $jobTypeDiv = $container.find('div.job-content-top-type').first();
      if ($jobTypeDiv.length > 0) {
        // First, try to extract from text content - this is most reliable
        const jobTypeText = $jobTypeDiv.text();
        
        // Try Hebrew first: "סוג משרה: מספר סוגים" or "סוג משרה: משרה מלאה"
        let jobTypeMatch = jobTypeText.match(/סוג\s*משרה[^:：]*[:：]\s*([^\n\r]+)/i);
        if (jobTypeMatch && jobTypeMatch[1]) {
          let typeValue = jobTypeMatch[1].trim();
          
          // If it says "מספר סוגים", we need to extract actual types from description
          if (typeValue.match(/מספר\s*סוגים/i)) {
            // Extract job types from description text - look for common patterns
            const descriptionText = $container.text();
            const typePatterns = [
              /משרה\s*מלאה/gi,
              /משרה\s*חלקית/gi,
              /משמרות/gi,
              /עבודה\s*זמנית/gi,
              /פרילאנס/gi,
              /עבודה\s*היברידית/gi,
              /עבודה\s*מהבית/gi,
              /לדוברי\s*שפות/gi,
              /מתאים\s*גם\s*לחיילים\s*משוחררים/gi,
              /מתאים\s*גם\s*למגזר\s*הדתי/gi,
              /ללא\s*ניסיון/gi,
              /עבודות\s*ללא\s*קורות\s*חיים/gi,
            ];
            for (const pattern of typePatterns) {
              const matches = descriptionText.matchAll(pattern);
              for (const match of matches) {
                const type = match[0].trim();
                if (type && !jobTypes.includes(type)) {
                  jobTypes.push(type);
                }
              }
            }
          } else {
            // Not "מספר סוגים" - extract the actual type value
            // Remove "מספר סוגים" if present
            typeValue = typeValue.replace(/מספר\s*סוגים/i, '').trim();
            if (typeValue && typeValue.length > 2) {
              // Split by common separators if multiple types
              const splitTypes = typeValue.split(/[,;|]/).map(t => t.trim()).filter(t => t.length > 0);
              if (splitTypes.length > 0) {
                splitTypes.forEach(t => {
                  if (!jobTypes.includes(t)) {
                    jobTypes.push(t);
                  }
                });
              } else {
                if (!jobTypes.includes(typeValue)) {
                  jobTypes.push(typeValue);
                }
              }
            }
          }
        } else {
          // Try English patterns
          jobTypeMatch = jobTypeText.match(/Job\s*Type[^:：]*[:：]\s*([^\n\r]+)/i);
          if (jobTypeMatch && jobTypeMatch[1]) {
            let typeValue = jobTypeMatch[1].trim();
            // Translate common English terms
            const typeTranslations: Record<string, string> = {
              'Full Time': 'משרה מלאה',
              'Part Time': 'משרה חלקית',
              'Full Time and Hybrid work': 'משרה מלאה ועבודה היברידית',
              'Shifts': 'משמרות',
              'Temporary': 'עבודה זמנית',
              'Freelance': 'פרילאנס',
              'Contract': 'חוזה',
              'Permanent': 'קבוע',
            };
            if (typeTranslations[typeValue]) {
              typeValue = typeTranslations[typeValue];
            }
            // Split if multiple types
            const splitTypes = typeValue.split(/and|&|,/).map(t => t.trim()).filter(t => t.length > 0);
            splitTypes.forEach(t => {
              const translated = typeTranslations[t] || t;
              if (!jobTypes.includes(translated)) {
                jobTypes.push(translated);
              }
            });
          } else {
            // Try just "Type:"
            jobTypeMatch = jobTypeText.match(/Type[^:：]*[:：]\s*([^\n\r]+)/i);
            if (jobTypeMatch && jobTypeMatch[1]) {
              let typeValue = jobTypeMatch[1].trim();
              const typeTranslations: Record<string, string> = {
                'Full Time': 'משרה מלאה',
                'Part Time': 'משרה חלקית',
                'Shifts': 'משמרות',
              };
              if (typeTranslations[typeValue]) {
                typeValue = typeTranslations[typeValue];
              }
              if (!jobTypes.includes(typeValue)) {
                jobTypes.push(typeValue);
              }
            }
          }
        }
        
        // Also get ALL job type elements (spans, divs, labels, links) as backup
        const $typeElements = $jobTypeDiv.find('span, div, label, a').not('a[href*="city="]');
        $typeElements.each((_, el) => {
          const typeText = $(el).text().trim();
          // Skip if it's just "סוג משרה:" or "Job Type:" or "מספר סוגים"
          if (typeText && 
              typeText.length > 2 && 
              !typeText.match(/^סוג\s*משרה[^:：]*[:：]?\s*$/i) &&
              !typeText.match(/^Job\s*Type[^:：]*[:：]?\s*$/i) &&
              !typeText.match(/^Type[^:：]*[:：]?\s*$/i) &&
              !typeText.match(/מספר\s*סוגים/i) &&
              !jobTypes.includes(typeText)) {
            jobTypes.push(typeText);
          }
        });
      }
      
      // Strategy 2: Fallback - look in container text (both Hebrew and English)
      if (jobTypes.length === 0) {
        const containerText = $container.text();
        const jobTypePatterns = [
          /סוג\s*משרה[^:：]*[:：]\s*([^\n\r]+)/i,
          /Job\s*Type[^:：]*[:：]\s*([^\n\r]+)/i,
          /Type[^:：]*[:：]\s*([^\n\r]+)/i,
        ];
        
        for (const pattern of jobTypePatterns) {
          const match = containerText.match(pattern);
          if (match && match[1]) {
            let typeValue = match[1].trim();
            // Skip if it's "מספר סוגים"
            if (typeValue.match(/מספר\s*סוגים/i)) {
              // Extract from description
              const typePatterns = [
                /משרה\s*מלאה/gi,
                /משרה\s*חלקית/gi,
                /משמרות/gi,
                /עבודה\s*זמנית/gi,
                /פרילאנס/gi,
              ];
              for (const pattern of typePatterns) {
                const matches = containerText.matchAll(pattern);
                for (const match of matches) {
                  const type = match[0].trim();
                  if (type && !jobTypes.includes(type)) {
                    jobTypes.push(type);
                  }
                }
              }
            } else {
              // Clean up common prefixes
              typeValue = typeValue.replace(/^סוג\s*משרה[^:：]*[:：]\s*/i, '').trim();
              typeValue = typeValue.replace(/^Job\s*Type[^:：]*[:：]\s*/i, '').trim();
              if (typeValue.length >= 2) {
                // Translate if English
                const typeTranslations: Record<string, string> = {
                  'Full Time': 'משרה מלאה',
                  'Part Time': 'משרה חלקית',
                  'Full Time and Hybrid work': 'משרה מלאה ועבודה היברידית',
                  'Shifts': 'משמרות',
                };
                if (typeTranslations[typeValue]) {
                  typeValue = typeTranslations[typeValue];
                }
                if (!jobTypes.includes(typeValue)) {
                  jobTypes.push(typeValue);
                }
                break;
              }
            }
          }
        }
      }
      
      // Strategy 3: Look for job type in structured data attributes or classes
      if (jobTypes.length === 0) {
        const $typeElement = $container.find('[data-job-type], [class*="job-type"], [class*="jobType"]').first();
        if ($typeElement.length > 0) {
          const typeValue = $typeElement.text().trim() || $typeElement.attr('data-job-type') || '';
          if (typeValue && typeValue.length >= 2) {
            jobTypes.push(typeValue);
          }
        }
      }
      
      // Join all job types
      if (jobTypes.length > 0) {
        jobType = jobTypes.join(', ');
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
      let jobTargetAudience = ''; // Store "המשרה מיועדת" separately
      
      // Strategy 1: Look for requirements in div.PT15
      const $requirementsDiv = $container.find('div.PT15').first();
      if ($requirementsDiv.length > 0) {
        const requirementsText = $requirementsDiv.text();
        const requirementsMatch = requirementsText.match(/דרישות[^:：]*[:：]\s*(.+)/is);
        if (requirementsMatch && requirementsMatch[1]) {
          let fullRequirements = requirementsMatch[1].trim();
          
          // Extract "המשרה מיועדת" text and remove it from requirements
          const targetAudienceMatch = fullRequirements.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
          if (targetAudienceMatch && targetAudienceMatch[1]) {
            jobTargetAudience = targetAudienceMatch[1].trim();
            // Remove it from requirements
            requirements = fullRequirements.replace(/(המשרה\s*מיועדת[^.]*\.?)/i, '').trim();
          } else {
            requirements = fullRequirements;
          }
        } else {
          // If no match, take all text after "דרישות:"
          let fullText = requirementsText.replace(/^[^:：]*[:：]\s*/i, '').trim();
          
          // Check for "המשרה מיועדת" in the full text
          const targetAudienceMatch = fullText.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
          if (targetAudienceMatch && targetAudienceMatch[1]) {
            jobTargetAudience = targetAudienceMatch[1].trim();
            // Remove it from requirements
            requirements = fullText.replace(/(המשרה\s*מיועדת[^.]*\.?)/i, '').trim();
          } else {
            requirements = fullText;
          }
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
            let fullRequirements = match[1].trim();
            
            // Check for "המשרה מיועדת" in the matched text
            const targetAudienceMatch = fullRequirements.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
            if (targetAudienceMatch && targetAudienceMatch[1]) {
              jobTargetAudience = targetAudienceMatch[1].trim();
              // Remove it from requirements
              requirements = fullRequirements.replace(/(המשרה\s*מיועדת[^.]*\.?)/i, '').trim();
            } else {
              requirements = fullRequirements;
            }
            break;
          }
        }
      }
      
      // Strategy 3: Look specifically for "המשרה מיועדת" text anywhere in container
      if (!jobTargetAudience) {
        const containerText = $container.text();
        const targetAudienceMatch = containerText.match(/(המשרה\s*מיועדת[^.]*\.?)/i);
        if (targetAudienceMatch && targetAudienceMatch[1]) {
          jobTargetAudience = targetAudienceMatch[1].trim();
        }
      }
      
      // Clean up requirements - remove any remaining "המשרה מיועדת" text
      if (requirements) {
        requirements = requirements.replace(/(המשרה\s*מיועדת[^.]*\.?)/i, '').trim();
      }

      // Construct absolute application URL
      const applicationUrl = href.startsWith('http')
        ? href
        : `${this.baseUrl}${href.startsWith('/') ? href : `/${href}`}`;

      // Extract category - COMPREHENSIVE: From multiple sources
      let category = '';
      
      // Strategy 1: Extract from CategoriesLinksOfJobSeoBox1_divJobCategoriesLinks (most reliable for job detail pages)
      // This is the category box that appears on the SIDE of job detail pages - NOT inside the job container
      // We search at the PAGE level ($), not the container level
      // IMPORTANT: There can be THREE categories:
      //   - Primary (PLink) - main category
      //   - Secondary (ChLink) - sub-category
      //   - JobsForVeterans - special category for veterans/other groups
      const $categoryBox = $('div#CategoriesLinksOfJobSeoBox1_divJobCategoriesLinks');
      if ($categoryBox.length > 0) {
        const categories: string[] = [];
        
        // Extract primary category from CategoriesLinksOfJobSeoBox1_PLink
        const $primaryCategoryLink = $categoryBox.find('a#CategoriesLinksOfJobSeoBox1_PLink');
        if ($primaryCategoryLink.length > 0) {
          const primaryCategoryText = $primaryCategoryLink.text().trim();
          if (primaryCategoryText && primaryCategoryText.length > 2) {
            categories.push(primaryCategoryText);
            this.logger.debug('Found primary category from CategoriesLinksOfJobSeoBox1_PLink', { category: primaryCategoryText });
          }
        }
        
        // Extract secondary category from CategoriesLinksOfJobSeoBox1_ChLink
        const $secondaryCategoryLink = $categoryBox.find('a#CategoriesLinksOfJobSeoBox1_ChLink');
        if ($secondaryCategoryLink.length > 0) {
          const secondaryCategoryText = $secondaryCategoryLink.text().trim();
          if (secondaryCategoryText && secondaryCategoryText.length > 2 && !categories.includes(secondaryCategoryText)) {
            categories.push(secondaryCategoryText);
            this.logger.debug('Found secondary category from CategoriesLinksOfJobSeoBox1_ChLink', { category: secondaryCategoryText });
          }
        }
        
        // Extract tertiary category from CategoriesLinksOfJobSeoBox1_JobsForVeterans (or similar special categories)
        const $tertiaryLinks = $categoryBox.find('a[id*="CategoriesLinksOfJobSeoBox1_"]').not('#CategoriesLinksOfJobSeoBox1_PLink').not('#CategoriesLinksOfJobSeoBox1_ChLink');
        $tertiaryLinks.each((_, el) => {
          const tertiaryText = $(el).text().trim();
          if (tertiaryText && tertiaryText.length > 2 && !categories.includes(tertiaryText)) {
            categories.push(tertiaryText);
            this.logger.debug('Found tertiary category', { category: tertiaryText });
          }
        });
        
        // If we found categories, join them with comma
        if (categories.length > 0) {
          category = categories.join(', ');
        }
        
        // Fallback: Get all L_Orange links in the category box (if IDs not found)
        if (!category || category.length < 2) {
          const $orangeLinks = $categoryBox.find('a.L_Orange');
          if ($orangeLinks.length > 0) {
            const foundCategories: string[] = [];
            $orangeLinks.each((_, el) => {
              const categoryText = $(el).text().trim();
              if (categoryText && categoryText.length > 2 && !foundCategories.includes(categoryText)) {
                foundCategories.push(categoryText);
              }
            });
            if (foundCategories.length > 0) {
              category = foundCategories.join(', ');
              this.logger.debug('Found categories from L_Orange links', { categories: foundCategories });
            }
          }
        }
      }
      
      // Strategy 2: Extract from breadcrumb in the full page (for job detail pages)
      // Breadcrumb format: "דרושים » בתי קפה, מסעדות ואירועים » דרוש שף רשתי..."
      if (!category || category.length < 2) {
        const $breadcrumb = $('h1').filter((_, el) => {
          const text = $(el).text();
          return text.includes('דרושים') && text.includes('»');
        }).first();
        
        if ($breadcrumb.length > 0) {
          // Look for links inside the breadcrumb with position parameter
          const $breadcrumbLinks = $breadcrumb.find('a[href*="position="]');
          if ($breadcrumbLinks.length > 0) {
            const $categoryLink = $breadcrumbLinks.eq(0);
            const categoryText = $categoryLink.text().trim();
            if (categoryText && categoryText.length > 2) {
              const isLocation = /^ראש|^תל|^חיפה|^ירושלים|^באר|^נתניה|^צפון|^דרום|^מרכז|^גוש|^אזור|^שפלה|^שרון|^קרית|^אשדוד|^רמת|^רעננה|^חולון|^בת|^ים|^גבעתיים|^פתח|^תקווה/i.test(categoryText);
              const isJobType = /^משרה|^סוג|^Job|^Type|^מספר|^מקומות|^סוגים/i.test(categoryText);
              if (!isLocation && !isJobType) {
                category = categoryText;
              }
            }
          }
          
          // Fallback: Extract from breadcrumb text pattern
          if (!category || category.length < 2) {
            const breadcrumbText = $breadcrumb.text();
            const breadcrumbMatch = breadcrumbText.match(/דרושים\s*»\s*([^»]+?)(?:\s*»|$)/);
            if (breadcrumbMatch && breadcrumbMatch[1]) {
              const potentialCategory = breadcrumbMatch[1].trim();
              const isLocation = /^ראש|^תל|^חיפה|^ירושלים|^באר|^נתניה|^צפון|^דרום|^מרכז|^גוש|^אזור|^שפלה|^שרון|^קרית|^אשדוד|^רמת|^רעננה|^חולון|^בת|^ים|^גבעתיים|^פתח|^תקווה/i.test(potentialCategory);
              const isJobType = /^משרה|^סוג|^Job|^Type|^מספר|^מקומות|^סוגים/i.test(potentialCategory);
              if (!isLocation && !isJobType && potentialCategory.length > 2) {
                category = potentialCategory;
              }
            }
          }
        }
      }
      
      // Strategy 2: Look for category in links with position parameter
      // On listing pages, category links appear near each job listing
      // We need to find the category link that's closest to THIS specific job
      if (!category || category.length < 2) {
        // First, try to find links with position= in the container
        let $categoryLinks = $container.find('a[href*="position="]').not('a[href*="city="]').not('a[href*="type="]');
        
        // If not found in container, search in parent elements (job might be in a wrapper)
        if ($categoryLinks.length === 0) {
          const $parent = $container.parent();
          if ($parent.length > 0) {
            $categoryLinks = $parent.find('a[href*="position="]').not('a[href*="city="]').not('a[href*="type="]');
          }
        }
        
        // If still not found, search in siblings (category might be in a sibling element)
        if ($categoryLinks.length === 0) {
          const $siblings = $container.siblings();
          $siblings.each((_, sibling) => {
            const $siblingLinks = $(sibling).find('a[href*="position="]').not('a[href*="city="]').not('a[href*="type="]');
            if ($siblingLinks.length > 0) {
              $categoryLinks = $categoryLinks.add($siblingLinks);
            }
          });
        }
        
        // Process found links
        let foundCategory = false;
        $categoryLinks.each((_, el) => {
          if (foundCategory) return; // Skip if we already found a category
          
          const $link = $(el);
          const linkText = $link.text().trim();
          const href = $link.attr('href') || '';
          
          // Skip if it's location, job type, or common non-category text
          const isLocation = /^מיקום|^Location|^ראש|^תל|^חיפה|^ירושלים|^באר|^נתניה|^צפון|^דרום|^מרכז|^גוש|^אזור|^שפלה|^שרון|^קרית|^אשדוד|^רמת|^רעננה|^חולון|^בת|^ים|^גבעתיים|^פתח|^תקווה|^מגדל|^כפר|^מושב|^קיבוץ/i.test(linkText);
          const isJobType = /^סוג|^Job|^Location|^Type|^מספר|^מקומות|^סוגים|^משרה|^חלקית|^מלאה|^משמרות/i.test(linkText);
          
          // Skip if href contains city= or type= parameters (these are locations/job types, not categories)
          const hasCityParam = href.includes('city=');
          const hasTypeParam = href.includes('type=');
          
          // Skip empty or very short text
          if (!linkText || linkText.length < 2 || linkText.length > 100) {
            return;
          }
          
          // Skip common non-category text
          if (linkText.match(/^דרושים$/i) || 
              linkText.match(/^כל\s*החברות$/i) ||
              linkText.match(/^הגש\s*מועמדות$/i) ||
              linkText.match(/^שמור\s*משרה$/i)) {
            return;
          }
          
          // If it's not a location or job type, and has position= parameter, it's likely a category
          if (!isLocation && 
              !isJobType &&
              !hasCityParam &&
              !hasTypeParam &&
              href.includes('position=')) {
            category = linkText;
            foundCategory = true;
          }
        });
      }
      
      // Strategy 3: Look for category in yellow-highlighted buttons or highlighted elements
      if (!category || category.length < 2) {
        // Look for highlighted/yellow buttons that might contain category
        const $categoryButtons = $container.find('button, a, span, div').filter((_, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          const classes = $el.attr('class') || '';
          // Check if it's highlighted or looks like a category button
          return (classes.includes('yellow') || classes.includes('highlight') || classes.includes('category')) &&
                 text.length > 2 &&
                 !text.match(/^סוג\s*משרה|^מיקום|^Job\s*Type|^Location/i);
        });
        
        $categoryButtons.each((_, el) => {
          const categoryText = $(el).text().trim();
          if (categoryText && categoryText.length > 2) {
            const categoryPatterns = [
              /חשמל|אלקטרוניקה|מכירות|מנהלה|שירות|לוגיסטיקה|חשבונאות|מחשבים|תוכנה|רפואה|בנייה|ביטחון|כלכלה|משאבי\s*אנוש|שיווק|חינוך|משפטים|אדריכלות|תקשורת|תיירות|מזון|מכונות|תעשיה|נהג|רכב|תחבורה|קמעונאות|רכש|יבוא|יצוא|ביטוח|הוראה|הדרכה|אדמיניסטרציה|מזכירות|פקידות/i,
            ];
            for (const pattern of categoryPatterns) {
              if (pattern.test(categoryText)) {
                if (!category) {
                  category = categoryText;
                } else if (!category.includes(categoryText)) {
                  category += ', ' + categoryText;
                }
                break;
              }
            }
          }
        });
      }
      
      // Strategy 4: Extract from page URL if available (for category pages)
      if ((!category || category.length < 2) && _pageUrl) {
        const urlMatch = _pageUrl.match(/position=(\d+)/);
        if (urlMatch) {
          // Could map position IDs to category names, but for now skip
        }
      }

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
        category: category || undefined,
        requirements: requirements || undefined,
        targetAudience: jobTargetAudience || undefined,
        applicationUrl,
        companyId,
        source: JobSource.ALLJOBS,
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

