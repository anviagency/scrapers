import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Logger interface for structured logging
 */
export interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Creates a Winston logger instance with structured logging
 * @param serviceName - Name of the service/module using the logger
 * @param correlationId - Optional correlation ID for distributed tracing
 * @returns Logger instance
 */
export function createLogger(
  serviceName: string,
  correlationId?: string
): Logger {
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Create log file path with date
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logFileName = `${serviceName}-${dateStr}.log`;
  const logFilePath = path.join(logsDir, logFileName);

  const transports: winston.transport[] = [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info: winston.Logform.TransformableInfo) => {
          const { timestamp, level, message, ...meta } = info;
          const metaStr = Object.keys(meta).length
            ? JSON.stringify(meta)
            : '';
          return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
      ),
    }),
    // File transport for persistent logging
    new winston.transports.File({
      filename: logFilePath,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 7, // Keep 7 days of logs
      format: logFormat,
    }),
    // Separate error log file
    new winston.transports.File({
      filename: path.join(logsDir, `${serviceName}-errors-${dateStr}.log`),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // Keep 30 days of error logs
      format: logFormat,
    }),
  ];

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
      service: serviceName,
      ...(correlationId && { correlationId }),
    },
    transports,
  });

  return {
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(message, meta);
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(message, meta);
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(message, meta);
    },
  };
}

