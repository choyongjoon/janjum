import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config({ path: '.env.local' });

// Create logger with pretty printing in development
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Helper function to safely format error messages
function formatErrorMessage(message: string, error?: unknown): string {
  if (error === undefined || error === null) {
    return message;
  }

  if (error instanceof Error) {
    return `${message} ${error.message}`;
  }

  if (typeof error === 'string') {
    return `${message} ${error}`;
  }

  return `${message} ${String(error)}`;
}

// Enhanced logger with safe error handling
const logger = {
  trace: (message: string) => baseLogger.trace(message),
  debug: (message: string, data?: Record<string, unknown>) => {
    if (data && typeof data === 'object') {
      baseLogger.debug(data, message);
    } else if (data !== undefined) {
      baseLogger.debug(formatErrorMessage(message, data));
    } else {
      baseLogger.debug(message);
    }
  },
  info: (message: string, data?: Record<string, unknown>) => {
    if (data && typeof data === 'object') {
      baseLogger.info(data, message);
    } else if (data !== undefined) {
      baseLogger.info(formatErrorMessage(message, data));
    } else {
      baseLogger.info(message);
    }
  },
  warn: (message: string, error?: unknown) => {
    baseLogger.warn(formatErrorMessage(message, error));
  },
  error: (message: string, error?: unknown) => {
    baseLogger.error(formatErrorMessage(message, error));
  },
  fatal: (message: string, error?: unknown) => {
    baseLogger.fatal(formatErrorMessage(message, error));
  },
};

export { logger };
