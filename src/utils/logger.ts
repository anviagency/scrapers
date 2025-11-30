import winston from 'winston';

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

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
      service: serviceName,
      ...(correlationId && { correlationId }),
    },
    transports: [
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
    ],
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

