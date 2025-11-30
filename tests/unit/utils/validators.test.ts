import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/utils/validators';
import { ScraperConfig } from '../../../src/types/ScraperConfig';

describe('Config Validator', () => {
  it('should load config from environment variables', () => {
    process.env.BASE_URL = 'https://test.alljobs.co.il';
    process.env.EVOMI_PROXY_KEY = 'test-key-123';
    process.env.RATE_LIMIT_DELAY_MS = '3000';
    process.env.MAX_RETRIES = '5';
    process.env.RETRY_DELAY_MS = '2000';
    process.env.LOG_LEVEL = 'debug';

    const config = loadConfig();
    expect(config.baseUrl).toBe('https://test.alljobs.co.il');
    expect(config.evomiProxyKey).toBe('test-key-123');
    expect(config.rateLimitDelayMs).toBe(3000);
    expect(config.maxRetries).toBe(5);
    expect(config.retryDelayMs).toBe(2000);
    expect(config.logLevel).toBe('debug');
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.BASE_URL;
    delete process.env.EVOMI_PROXY_KEY;
    delete process.env.RATE_LIMIT_DELAY_MS;
    delete process.env.MAX_RETRIES;
    delete process.env.RETRY_DELAY_MS;
    delete process.env.LOG_LEVEL;

    // Set required field
    process.env.EVOMI_PROXY_KEY = 'required-key';

    const config = loadConfig();
    expect(config.baseUrl).toBe('https://www.alljobs.co.il');
    expect(config.rateLimitDelayMs).toBe(2500);
    expect(config.maxRetries).toBe(3);
    expect(config.retryDelayMs).toBe(1000);
    expect(config.logLevel).toBe('info');
  });

  it('should throw error when required EVOMI_PROXY_KEY is missing', () => {
    delete process.env.EVOMI_PROXY_KEY;

    expect(() => loadConfig()).toThrow();
  });

  it('should parse numeric environment variables correctly', () => {
    process.env.EVOMI_PROXY_KEY = 'test-key';
    process.env.RATE_LIMIT_DELAY_MS = '5000';
    process.env.MAX_RETRIES = '10';
    process.env.RETRY_DELAY_MS = '3000';

    const config = loadConfig();
    expect(typeof config.rateLimitDelayMs).toBe('number');
    expect(typeof config.maxRetries).toBe('number');
    expect(typeof config.retryDelayMs).toBe('number');
  });
});

