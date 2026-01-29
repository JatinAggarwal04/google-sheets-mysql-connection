// ===========================================
// Winston Logger Configuration
// ===========================================

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const customFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (stack) {
        msg += `\n${stack}`;
    }

    if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
    }

    return msg;
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
    ),
    transports: [
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                customFormat
            ),
        }),
    ],
    exceptionHandlers: [
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                customFormat
            ),
        }),
    ],
    rejectionHandlers: [
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                customFormat
            ),
        }),
    ],
});

// Create child logger for specific modules
export function createModuleLogger(moduleName: string) {
    return logger.child({ module: moduleName });
}
