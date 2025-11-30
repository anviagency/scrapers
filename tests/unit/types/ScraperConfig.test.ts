import { describe, it, expect } from 'vitest';
import { ScraperConfigSchema, type ScraperConfig } from '../../../src/types/ScraperConfig';

describe('ScraperConfig Schema', () => {
  it('should validate a complete config with all fields', () => {
    const validConfig: ScraperConfig = {
      baseUrl: 'https://www.alljobs.co.il',
      evomiProxyKey: 'f827e84c-471e-4d53-a25d-53624417f7ec',
      evomiProxyEndpoint: 'https://proxy.evomi.com:8080',
      rateLimitDelayMs: 2500,
      maxRetries: 3,
      retryDelayMs: 1000,
      logLevel: 'info',
      maxPages: 100,
      resumeFromPage: 5,
    };

    const result = ScraperConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should apply default values for optional fields', () => {
    const minimalConfig = {
      baseUrl: 'https://www.alljobs.co.il',
      evomiProxyKey: 'f827e84c-471e-4d53-a25d-53624417f7ec',
    };

    const result = ScraperConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rateLimitDelayMs).toBe(2500);
      expect(result.data.maxRetries).toBe(3);
      expect(result.data.retryDelayMs).toBe(1000);
      expect(result.data.logLevel).toBe('info');
    }
  });

  it('should reject config with invalid URL', () => {
    const invalidConfig = {
      baseUrl: 'not-a-valid-url',
      evomiProxyKey: 'f827e84c-471e-4d53-a25d-53624417f7ec',
    };

    const result = ScraperConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should reject config with empty proxy key', () => {
    const invalidConfig = {
      baseUrl: 'https://www.alljobs.co.il',
      evomiProxyKey: '',
    };

    const result = ScraperConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should reject config with negative rate limit delay', () => {
    const invalidConfig = {
      baseUrl: 'https://www.alljobs.co.il',
      evomiProxyKey: 'f827e84c-471e-4d53-a25d-53624417f7ec',
      rateLimitDelayMs: -100,
    };

    const result = ScraperConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should reject config with invalid log level', () => {
    const invalidConfig = {
      baseUrl: 'https://www.alljobs.co.il',
      evomiProxyKey: 'f827e84c-471e-4d53-a25d-53624417f7ec',
      logLevel: 'invalid-level',
    };

    const result = ScraperConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});

