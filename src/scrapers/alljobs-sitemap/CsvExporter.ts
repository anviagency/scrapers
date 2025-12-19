import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../../utils/logger';
import type { JobListing } from '../../types/JobListing';

/**
 * CSV Exporter with Hebrew encoding support
 * Exports job listings to CSV files with proper UTF-8 BOM for Excel compatibility
 */
export class CsvExporter {
  private readonly outputDir: string;
  private readonly logger: Logger;

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
   * Export jobs to CSV file with Hebrew support
   * @param jobs - Array of job listings to export
   * @param filename - Base filename (without extension)
   * @returns Path to the exported file
   */
  async exportToCsv(jobs: JobListing[], filename: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(this.outputDir, `${filename}-${timestamp}.csv`);

      if (jobs.length === 0) {
        this.logger.warn('No jobs to export to CSV', { filePath });
        fs.writeFileSync(filePath, '\uFEFF', 'utf8'); // Write just BOM for empty file
        return filePath;
      }

      // CSV headers (in both Hebrew and English for clarity)
      const headers = [
        'jobId',
        'title',
        'company',
        'companyId',
        'description',
        'location',
        'jobType',
        'category',
        'requirements',
        'targetAudience',
        'applicationUrl',
        'source',
      ];

      // Build CSV rows
      const rows = jobs.map((job) => [
        this.escapeCsvField(job.jobId),
        this.escapeCsvField(job.title),
        this.escapeCsvField(job.company),
        this.escapeCsvField(job.companyId || ''),
        this.escapeCsvField(job.description),
        this.escapeCsvField(job.location),
        this.escapeCsvField(job.jobType),
        this.escapeCsvField(job.category || ''),
        this.escapeCsvField(job.requirements || ''),
        this.escapeCsvField(job.targetAudience || ''),
        this.escapeCsvField(job.applicationUrl),
        this.escapeCsvField(job.source),
      ]);

      // Combine headers and rows
      const csvLines = [headers.join(','), ...rows.map((row) => row.join(','))];
      const csvContent = csvLines.join('\n');

      // Write with UTF-8 BOM for Excel compatibility with Hebrew
      const BOM = '\uFEFF';
      const buffer = Buffer.from(BOM + csvContent, 'utf8');
      fs.writeFileSync(filePath, buffer);

      this.logger.info('Exported jobs to CSV', {
        filePath,
        jobCount: jobs.length,
        fileSize: buffer.length,
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
   * Export jobs to JSON file
   * @param jobs - Array of job listings to export
   * @param filename - Base filename (without extension)
   * @returns Path to the exported file
   */
  async exportToJson(jobs: JobListing[], filename: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(this.outputDir, `${filename}-${timestamp}.json`);

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
   * Export jobs to both CSV and JSON
   * @param jobs - Array of job listings to export
   * @param filename - Base filename (without extension)
   * @returns Paths to exported files
   */
  async exportAll(
    jobs: JobListing[],
    filename: string
  ): Promise<{ csv: string; json: string }> {
    const csvPath = await this.exportToCsv(jobs, filename);
    const jsonPath = await this.exportToJson(jobs, filename);
    return { csv: csvPath, json: jsonPath };
  }

  /**
   * Stream export for large datasets - writes incrementally to file
   * @param filename - Base filename (without extension)
   * @returns Object with addJob and finish methods
   */
  createStreamExporter(filename: string): {
    addJob: (job: JobListing) => void;
    finish: () => string;
  } {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.outputDir, `${filename}-${timestamp}.csv`);

    // Write headers first with BOM
    const headers = [
      'jobId',
      'title',
      'company',
      'companyId',
      'description',
      'location',
      'jobType',
      'category',
      'requirements',
      'targetAudience',
      'applicationUrl',
      'source',
    ];
    const BOM = '\uFEFF';
    fs.writeFileSync(filePath, BOM + headers.join(',') + '\n', 'utf8');

    let jobCount = 0;

    return {
      addJob: (job: JobListing) => {
        const row = [
          this.escapeCsvField(job.jobId),
          this.escapeCsvField(job.title),
          this.escapeCsvField(job.company),
          this.escapeCsvField(job.companyId || ''),
          this.escapeCsvField(job.description),
          this.escapeCsvField(job.location),
          this.escapeCsvField(job.jobType),
          this.escapeCsvField(job.category || ''),
          this.escapeCsvField(job.requirements || ''),
          this.escapeCsvField(job.targetAudience || ''),
          this.escapeCsvField(job.applicationUrl),
          this.escapeCsvField(job.source),
        ];
        fs.appendFileSync(filePath, row.join(',') + '\n', 'utf8');
        jobCount++;
      },
      finish: () => {
        this.logger.info('Stream export completed', {
          filePath,
          jobCount,
        });
        return filePath;
      },
    };
  }

  /**
   * Escape CSV field value (handles commas, quotes, newlines)
   * @param field - Field value to escape
   * @returns Escaped field value
   */
  private escapeCsvField(field: string): string {
    if (!field) {
      return '';
    }

    // Convert to string and trim
    let str = String(field).trim();

    // Remove control characters that cause encoding issues
    // eslint-disable-next-line no-control-regex
    str = str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Remove zero-width spaces
    str = str.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Replace newlines with spaces for CSV compatibility
    str = str.replace(/[\r\n]+/g, ' ');

    // If field contains comma, quote, or special characters, wrap in quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      // Escape quotes by doubling them
      str = str.replace(/"/g, '""');
      // Wrap in quotes
      return `"${str}"`;
    }

    return str;
  }
}
