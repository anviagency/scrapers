import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataExporter } from '../../../src/export/DataExporter';
import { createLogger } from '../../../src/utils/logger';
import { JobListing } from '../../../src/types/JobListing';
import * as fs from 'fs';
import * as path from 'path';

describe('DataExporter', () => {
  let exporter: DataExporter;
  const logger = createLogger('test');
  const testOutputDir = path.join(__dirname, '../../test-output');

  beforeEach(() => {
    exporter = new DataExporter(testOutputDir, logger);
    // Create test output directory
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testOutputDir)) {
      const files = fs.readdirSync(testOutputDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testOutputDir, file));
      });
      fs.rmdirSync(testOutputDir);
    }
  });

  it('should create an instance', () => {
    expect(exporter).toBeDefined();
  });

  it('should export jobs to JSON file', async () => {
    const jobs: JobListing[] = [
      {
        jobId: '123',
        title: 'Test Job',
        company: 'Test Company',
        description: 'Test description',
        location: 'Test Location',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    const filePath = await exporter.exportToJson(jobs, 'test-jobs');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].jobId).toBe('123');
  });

  it('should export jobs to CSV file', async () => {
    const jobs: JobListing[] = [
      {
        jobId: '123',
        title: 'Test Job',
        company: 'Test Company',
        description: 'Test description',
        location: 'Test Location',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    const filePath = await exporter.exportToCsv(jobs, 'test-jobs');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('jobId');
    expect(content).toContain('123');
    expect(content).toContain('Test Job');
  });

  it('should handle Hebrew text in CSV export', async () => {
    const jobs: JobListing[] = [
      {
        jobId: '123',
        title: 'משרה בעברית',
        company: 'חברה בעברית',
        description: 'תיאור בעברית',
        location: 'תל אביב',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    const filePath = await exporter.exportToCsv(jobs, 'hebrew-jobs');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('משרה בעברית');
    expect(content).toContain('חברה בעברית');
  });

  it('should handle empty job list', async () => {
    const jobs: JobListing[] = [];

    const jsonPath = await exporter.exportToJson(jobs, 'empty');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const content = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveLength(0);
  });

  it('should create output directory if it does not exist', async () => {
    const customDir = path.join(__dirname, '../../custom-output');
    const customExporter = new DataExporter(customDir, logger);

    const jobs: JobListing[] = [
      {
        jobId: '123',
        title: 'Test',
        company: 'Test',
        description: 'Test',
        location: 'Test',
        jobType: 'משרה מלאה',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
      },
    ];

    const filePath = await customExporter.exportToJson(jobs, 'test');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(customDir)).toBe(true);

    // Cleanup
    fs.unlinkSync(filePath);
    fs.rmdirSync(customDir);
  });

  it('should include all job fields in CSV', async () => {
    const jobs: JobListing[] = [
      {
        jobId: '123',
        title: 'Test Job',
        company: 'Test Company',
        description: 'Test description',
        location: 'Test Location',
        jobType: 'משרה מלאה',
        requirements: 'Test requirements',
        applicationUrl: '/Search/UploadSingle.aspx?JobID=123',
        postedDate: '2025-01-15',
        companyId: '456',
      },
    ];

    const filePath = await exporter.exportToCsv(jobs, 'complete-jobs');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('jobId');
    expect(content).toContain('title');
    expect(content).toContain('company');
    expect(content).toContain('description');
    expect(content).toContain('location');
    expect(content).toContain('jobType');
    expect(content).toContain('requirements');
    expect(content).toContain('applicationUrl');
  });
});

