import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger, type Logger } from '../../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger('test');
  });

  it('should create a logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should log error messages', () => {
    expect(() => logger.error('Test error message')).not.toThrow();
  });

  it('should log warning messages', () => {
    expect(() => logger.warn('Test warning message')).not.toThrow();
  });

  it('should log info messages', () => {
    expect(() => logger.info('Test info message')).not.toThrow();
  });

  it('should log debug messages', () => {
    expect(() => logger.debug('Test debug message')).not.toThrow();
  });

  it('should log with metadata', () => {
    expect(() =>
      logger.info('Test message', { jobId: '123', page: 1 })
    ).not.toThrow();
  });

  it('should create logger with correlation ID', () => {
    const loggerWithId = createLogger('test', 'correlation-123');
    expect(loggerWithId).toBeDefined();
  });
});

