import winston from 'winston';
import { isProduction } from '../config/index.js';

const { format, transports, createLogger } = winston;

/**
 * Custom format for development - colorized and readable
 */
const devFormat = format.combine(
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })
);

/**
 * Custom format for production - JSON for log aggregation
 */
const prodFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
);

/**
 * Create the logger instance
 * - Production: JSON format, no colors, suitable for log aggregation (ELK, CloudWatch, etc.)
 * - Development: Colorized, human-readable format
 */
const logger = createLogger({
    level: process.env['LOG_LEVEL'] ?? 'info',
    format: isProduction() ? prodFormat : devFormat,
    defaultMeta: { service: 'sheets-mysql-sync' },
    transports: [
        new transports.Console({
            // In production, we don't use colors
            handleExceptions: true,
            handleRejections: true,
        }),
    ],
    // Don't exit on handled exceptions
    exitOnError: false,
});

/**
 * Structured logging helpers with typed metadata
 */
export interface LogContext {
    component?: string;
    operation?: string;
    duration?: number;
    rowId?: string | number;
    sheetRange?: string;
    error?: Error | unknown;
    [key: string]: unknown;
}

/**
 * Log an info message with optional context
 */
export function logInfo(message: string, context?: LogContext): void {
    logger.info(message, sanitizeContext(context));
}

/**
 * Log a warning message with optional context
 */
export function logWarn(message: string, context?: LogContext): void {
    logger.warn(message, sanitizeContext(context));
}

/**
 * Log an error message with optional context
 */
export function logError(message: string, context?: LogContext): void {
    logger.error(message, sanitizeContext(context));
}

/**
 * Log a debug message with optional context
 */
export function logDebug(message: string, context?: LogContext): void {
    logger.debug(message, sanitizeContext(context));
}

/**
 * Log HTTP requests (for middleware)
 */
export function logHttp(message: string, context?: LogContext): void {
    logger.http(message, sanitizeContext(context));
}

/**
 * Sanitize context to prevent logging sensitive data
 * and convert Error objects to serializable format
 */
function sanitizeContext(context?: LogContext): Record<string, unknown> | undefined {
    if (!context) return undefined;

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
        // Skip undefined values
        if (value === undefined) continue;

        // Never log passwords or secrets
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
            sanitized[key] = '[REDACTED]';
            continue;
        }

        // Serialize errors properly
        if (value instanceof Error) {
            sanitized[key] = {
                name: value.name,
                message: value.message,
                stack: isProduction() ? undefined : value.stack,
            };
            continue;
        }

        sanitized[key] = value;
    }

    return sanitized;
}

/**
 * Create a child logger with preset context
 */
export function createComponentLogger(component: string) {
    return {
        info: (message: string, context?: Omit<LogContext, 'component'>) =>
            logInfo(message, { ...context, component }),
        warn: (message: string, context?: Omit<LogContext, 'component'>) =>
            logWarn(message, { ...context, component }),
        error: (message: string, context?: Omit<LogContext, 'component'>) =>
            logError(message, { ...context, component }),
        debug: (message: string, context?: Omit<LogContext, 'component'>) =>
            logDebug(message, { ...context, component }),
    };
}

export default logger;
