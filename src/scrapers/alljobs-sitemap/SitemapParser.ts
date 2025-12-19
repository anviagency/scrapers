import type { Logger } from '../../utils/logger';

/**
 * Job URL entry from sitemap
 */
export interface SitemapEntry {
  url: string;
  jobId: string;
  lastModified?: string;
  changeFreq?: string;
  priority?: string;
}

/**
 * Parser for AllJobs sitemap XML
 * Extracts job URLs from the sitemap XML content
 */
export class SitemapParser {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parse sitemap XML content and extract job URLs
   * The sitemap format is standard XML sitemap with <url><loc>...</loc></url> structure
   *
   * @param xmlContent - Raw XML content from sitemap
   * @returns Array of sitemap entries with job URLs
   */
  parseXml(xmlContent: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];

    try {
      // Extract all <url> blocks
      // The format appears to be: <loc>URL</loc><lastmod>DATE</lastmod><changefreq>FREQ</changefreq><priority>PRIORITY</priority>
      // But based on user's sample, it seems the XML might be malformed/concatenated

      // Try to extract URLs using regex patterns
      // Pattern 1: Standard sitemap format
      const urlRegex = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?(?:\s*<changefreq>([^<]*)<\/changefreq>)?(?:\s*<priority>([^<]*)<\/priority>)?\s*<\/url>/gi;

      let match;
      while ((match = urlRegex.exec(xmlContent)) !== null) {
        const url = match[1].trim();
        const jobIdMatch = url.match(/JobID=(\d+)/i);

        if (jobIdMatch) {
          entries.push({
            url,
            jobId: jobIdMatch[1],
            lastModified: match[2]?.trim(),
            changeFreq: match[3]?.trim(),
            priority: match[4]?.trim(),
          });
        }
      }

      // If no matches with standard format, try alternative parsing
      // Based on user's sample: URLs seem to be directly concatenated
      if (entries.length === 0) {
        this.logger.debug('Standard XML parsing found no results, trying alternative parsing');

        // Extract all URLs with JobID parameter
        const simpleUrlRegex = /https?:\/\/[^\s<>"]+JobID=\d+/gi;
        const urlMatches = xmlContent.match(simpleUrlRegex) || [];

        // Also try to find URLs in <loc> tags
        const locRegex = /<loc>([^<]+)<\/loc>/gi;
        let locMatch;
        while ((locMatch = locRegex.exec(xmlContent)) !== null) {
          const url = locMatch[1].trim();
          if (url.includes('JobID=')) {
            const jobIdMatch = url.match(/JobID=(\d+)/i);
            if (jobIdMatch && !entries.some(e => e.jobId === jobIdMatch[1])) {
              entries.push({
                url,
                jobId: jobIdMatch[1],
              });
            }
          }
        }

        // Add any direct URL matches that weren't in <loc> tags
        for (const url of urlMatches) {
          const jobIdMatch = url.match(/JobID=(\d+)/i);
          if (jobIdMatch && !entries.some(e => e.jobId === jobIdMatch[1])) {
            entries.push({
              url,
              jobId: jobIdMatch[1],
            });
          }
        }
      }

      this.logger.info('Parsed sitemap', {
        totalEntries: entries.length,
        sampleUrls: entries.slice(0, 3).map(e => e.url),
      });

      return entries;
    } catch (error) {
      this.logger.error('Failed to parse sitemap XML', {
        error: error instanceof Error ? error.message : String(error),
        contentLength: xmlContent.length,
        contentSample: xmlContent.substring(0, 500),
      });
      return [];
    }
  }

  /**
   * Filter entries to only include valid job URLs
   * @param entries - Array of sitemap entries
   * @returns Filtered array with only valid job entries
   */
  filterValidEntries(entries: SitemapEntry[]): SitemapEntry[] {
    const validEntries = entries.filter(entry => {
      // Must have a valid job ID
      if (!entry.jobId || !/^\d+$/.test(entry.jobId)) {
        return false;
      }

      // URL must point to job detail page
      if (!entry.url.includes('UploadSingle.aspx') && !entry.url.includes('JobID=')) {
        return false;
      }

      return true;
    });

    this.logger.debug('Filtered valid entries', {
      originalCount: entries.length,
      validCount: validEntries.length,
    });

    return validEntries;
  }

  /**
   * Remove duplicate entries (same jobId)
   * @param entries - Array of sitemap entries
   * @returns Array with duplicates removed
   */
  removeDuplicates(entries: SitemapEntry[]): SitemapEntry[] {
    const seen = new Set<string>();
    const unique: SitemapEntry[] = [];

    for (const entry of entries) {
      if (!seen.has(entry.jobId)) {
        seen.add(entry.jobId);
        unique.push(entry);
      }
    }

    if (unique.length !== entries.length) {
      this.logger.debug('Removed duplicate entries', {
        originalCount: entries.length,
        uniqueCount: unique.length,
        duplicatesRemoved: entries.length - unique.length,
      });
    }

    return unique;
  }
}
