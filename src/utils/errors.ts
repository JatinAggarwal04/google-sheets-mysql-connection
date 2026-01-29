/**
 * Base class for all application errors
 * Provides consistent error structure for logging and API responses
 */
export class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        options: {
            code?: string;
            statusCode?: number;
            isOperational?: boolean;
            context?: Record<string, unknown>;
            cause?: Error;
        } = {}
    ) {
        super(message, { cause: options.cause });
        this.name = this.constructor.name;
        this.code = options.code ?? 'INTERNAL_ERROR';
        this.statusCode = options.statusCode ?? 500;
        this.isOperational = options.isOperational ?? true;
        if (options.context) {
            this.context = options.context;
        }

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Convert to JSON for API responses
     */
    toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.context && { details: this.context }),
            },
        };
    }
}

/**
 * Configuration errors (invalid config, missing required values)
 */
export class ConfigurationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, {
            code: 'CONFIGURATION_ERROR',
            statusCode: 500,
            isOperational: false,
            context: context ?? {},
        });
    }
}

/**
 * Database connection and query errors
 */
export class DatabaseError extends AppError {
    constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
        super(message, {
            code: 'DATABASE_ERROR',
            statusCode: 503,
            isOperational: true,
            ...options,
        });
    }
}

/**
 * Google Sheets API errors
 */
export class SheetsApiError extends AppError {
    constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
        super(message, {
            code: 'SHEETS_API_ERROR',
            statusCode: 502,
            isOperational: true,
            ...options,
        });
    }
}

/**
 * Sync-related errors (conflicts, loop detection, etc.)
 */
export class SyncError extends AppError {
    constructor(message: string, options?: { code?: string; context?: Record<string, unknown> }) {
        super(message, {
            code: options?.code ?? 'SYNC_ERROR',
            statusCode: 500,
            isOperational: true,
            context: options?.context ?? {},
        });
    }
}

/**
 * Conflict error for manual resolution
 */
export class ConflictError extends SyncError {
    public readonly sheetValue: unknown;
    public readonly mysqlValue: unknown;
    public readonly rowId: string | number;
    public readonly column: string;

    constructor(options: {
        rowId: string | number;
        column: string;
        sheetValue: unknown;
        mysqlValue: unknown;
    }) {
        super(`Conflict detected for row ${options.rowId}, column ${options.column}`, {
            code: 'SYNC_CONFLICT',
            context: {
                rowId: options.rowId,
                column: options.column,
                sheetValue: options.sheetValue,
                mysqlValue: options.mysqlValue,
            },
        });
        this.rowId = options.rowId;
        this.column = options.column;
        this.sheetValue = options.sheetValue;
        this.mysqlValue = options.mysqlValue;
    }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, {
            code: 'AUTHENTICATION_ERROR',
            statusCode: 401,
            isOperational: true,
        });
    }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
    constructor(retryAfterMs?: number) {
        super('Too many requests', {
            code: 'RATE_LIMIT_EXCEEDED',
            statusCode: 429,
            isOperational: true,
            context: retryAfterMs ? { retryAfterMs } : {},
        });
    }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, {
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            isOperational: true,
            context: context ?? {},
        });
    }
}

/**
 * Check if an error is an operational error (expected, can be handled gracefully)
 * vs a programming error (unexpected, should crash)
 */
export function isOperationalError(error: unknown): boolean {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
}

/**
 * Serialize an error for logging
 */
export function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof AppError) {
        return {
            name: error.name,
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
            isOperational: error.isOperational,
            context: error.context,
            stack: error.stack,
            cause: error.cause ? serializeError(error.cause) : undefined,
        };
    }

    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause ? serializeError(error.cause) : undefined,
        };
    }

    return {
        type: typeof error,
        value: String(error),
    };
}
