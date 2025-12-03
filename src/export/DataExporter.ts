import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../utils/logger';
import type { JobListing } from '../types/JobListing';

/**
 * Exports job listings to various file formats
 */
export class DataExporter {
  private readonly outputDir: string;
  private readonly logger: Logger;

  /**
   * Creates a new DataExporter instance
   * @param outputDir - Directory to save exported files
   * @param logger - Logger instance
   */
  constructor(outputDir: string, logger: Logger) {
    this.outputDir = outputDir;
    this.logger = logger;

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      this.logger.info('Created output directory', { outputDir });
    }
  }

  /**
   * Exports job listings to JSON file
   * @param jobs - Array of job listings to export
   * @param filename - Base filename (without extension)
   * @returns Path to the exported file
   */
  async exportToJson(jobs: JobListing[], filename: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(
        this.outputDir,
        `${filename}-${timestamp}.json`
      );

      const jsonContent = JSON.stringify(jobs, null, 2);
      fs.writeFileSync(filePath, jsonContent, 'utf-8');

      this.logger.info('Exported jobs to JSON', {
        filePath,
        jobCount: jobs.length,
      });

      return filePath;
    } catch (error) {
      this.logger.error('Failed to export to JSON', {
        error: error instanceof Error ? error.message : String(error),
        filename,
      });
      throw error;
    }
  }

  /**
   * Exports job listings to CSV file
   * @param jobs - Array of job listings to export
   * @param filename - Base filename (without extension)
   * @returns Path to the exported file
   */
  async exportToCsv(jobs: JobListing[], filename: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(
        this.outputDir,
        `${filename}-${timestamp}.csv`
      );

      if (jobs.length === 0) {
        fs.writeFileSync(filePath, '', 'utf-8');
        this.logger.warn('No jobs to export to CSV', { filePath });
        return filePath;
      }

      // CSV headers
      const headers = [
        'jobId',
        'title',
        'company',
        'description',
        'location',
        'jobType',
        'category',
        'requirements',
        'targetAudience',
        'applicationUrl',
        'postedDate',
        'companyId',
      ];

      // CSV rows
      const rows = jobs.map((job) => {
        return [
          this.escapeCsvField(job.jobId),
          this.escapeCsvField(job.title),
          this.escapeCsvField(job.company),
          this.escapeCsvField(job.description),
          this.escapeCsvField(job.location),
          this.escapeCsvField(job.jobType),
          this.escapeCsvField((job as any).category || ''),
          this.escapeCsvField(job.requirements || ''),
          this.escapeCsvField(job.targetAudience || ''),
          this.escapeCsvField(job.applicationUrl),
          this.escapeCsvField(job.postedDate || ''),
          this.escapeCsvField(job.companyId || ''),
        ];
      });

      // Combine headers and rows
      const csvLines = [headers.join(',')].concat(
        rows.map((row) => row.join(','))
      );
      const csvContent = csvLines.join('\n');

      // Write with UTF-8 BOM for Excel compatibility with Hebrew
      // Use 'utf8' encoding explicitly and add BOM at the beginning
      const BOM = '\uFEFF';
      const buffer = Buffer.from(BOM + csvContent, 'utf8');
      fs.writeFileSync(filePath, buffer);

      this.logger.info('Exported jobs to CSV', {
        filePath,
        jobCount: jobs.length,
      });

      return filePath;
    } catch (error) {
      this.logger.error('Failed to export to CSV', {
        error: error instanceof Error ? error.message : String(error),
        filename,
      });
      throw error;
    }
  }

  /**
   * Escapes CSV field values (handles commas, quotes, newlines)
   * @param field - Field value to escape
   * @returns Escaped field value
   */
  private escapeCsvField(field: string): string {
    if (!field) {
      return '';
    }

    // Convert to string and trim
    let str = String(field).trim();

    // Remove or replace problematic characters that cause encoding issues
    // Replace zero-width and control characters
    str = str.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF]/g, '');
    
    // Replace any remaining problematic Unicode characters
    str = str.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      // Escape quotes by doubling them
      str = str.replace(/"/g, '""');
      // Wrap in quotes
      return `"${str}"`;
    }

    return str;
  }

  /**
   * Exports jobs to both JSON and CSV formats
   * @param jobs - Array of job listings to export
   * @param filename - Base filename (without extension)
   * @returns Object with paths to exported files
   */
  async exportAll(
    jobs: JobListing[],
    filename: string
  ): Promise<{ json: string; csv: string }> {
    const jsonPath = await this.exportToJson(jobs, filename);
    const csvPath = await this.exportToCsv(jobs, filename);

    return { json: jsonPath, csv: csvPath };
  }
}

