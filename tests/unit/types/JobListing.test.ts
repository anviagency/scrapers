import { describe, it, expect } from 'vitest';
import { JobListingSchema, type JobListing } from '../../../src/types/JobListing';

describe('JobListing Schema', () => {
  it('should validate a complete job listing', () => {
    const validJob: JobListing = {
      jobId: '8391177',
      title: 'דרוש /ה עו"ד בתחום המיסוי המוניציפאלי',
      company: 'חברה חסויה',
      description: 'משרדנו מתמחה במשפט מנהלי...',
      location: 'תל אביב',
      jobType: 'משרה מלאה',
      requirements: 'ניסיון של 02 שנים',
      applicationUrl: '/Search/UploadSingle.aspx?JobID=8391177',
      postedDate: '2025-01-15',
      companyId: '12345',
    };

    const result = JobListingSchema.safeParse(validJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobId).toBe('8391177');
      expect(result.data.title).toBe('דרוש /ה עו"ד בתחום המיסוי המוניציפאלי');
    }
  });

  it('should reject job listing with missing required fields', () => {
    const invalidJob = {
      jobId: '8391177',
      // missing title
      company: 'חברה חסויה',
    };

    const result = JobListingSchema.safeParse(invalidJob);
    expect(result.success).toBe(false);
  });

  it('should reject job listing with invalid jobId format', () => {
    const invalidJob = {
      jobId: '', // empty string
      title: 'Test Job',
      company: 'Test Company',
      description: 'Test description',
      location: 'Test Location',
      jobType: 'משרה מלאה',
      requirements: 'Test requirements',
      applicationUrl: '/Search/UploadSingle.aspx?JobID=8391177',
      postedDate: '2025-01-15',
    };

    const result = JobListingSchema.safeParse(invalidJob);
    expect(result.success).toBe(false);
  });

  it('should accept optional fields', () => {
    const jobWithoutOptional: JobListing = {
      jobId: '8391177',
      title: 'Test Job',
      company: 'Test Company',
      description: 'Test description',
      location: 'Test Location',
      jobType: 'משרה מלאה',
      requirements: 'Test requirements',
      applicationUrl: '/Search/UploadSingle.aspx?JobID=8391177',
      postedDate: '2025-01-15',
      // companyId is optional
    };

    const result = JobListingSchema.safeParse(jobWithoutOptional);
    expect(result.success).toBe(true);
  });

  it('should handle Hebrew text correctly', () => {
    const hebrewJob: JobListing = {
      jobId: '8420768',
      title: 'מנהל /ת תיקי לקוחות טלפוני',
      company: 'Dun & Bradstreet',
      description: 'לחברת דן אנד ברדסטריט - הגדולה והמובילה בעולם',
      location: 'בני ברק',
      jobType: 'משרה מלאה',
      requirements: 'ניסיון במכירות תודעת שירות ברמה גבוהה',
      applicationUrl: '/Search/UploadSingle.aspx?JobID=8420768',
      postedDate: '2025-01-15',
    };

    const result = JobListingSchema.safeParse(hebrewJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toContain('מנהל');
      expect(result.data.description).toContain('דן אנד ברדסטריט');
    }
  });
});

