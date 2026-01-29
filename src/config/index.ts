import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Configuration schema with validation
const configSchema = z.object({
    // Server
    port: z.number().int().positive().default(3000),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

    // MySQL
    mysql: z.object({
        host: z.string().min(1),
        port: z.number().int().positive().default(3306),
        user: z.string().min(1),
        password: z.string(),
        database: z.string().min(1),
    }),

    // Google Sheets
    sheets: z.object({
        spreadsheetId: z.string().min(1),
        sheetName: z.string().default('Sheet1'),
        serviceAccountEmail: z.string().email().optional(),
        privateKeyPath: z.string().optional(),
        credentials: z.any().optional(), // Loaded at runtime
    }),

    // Sync
    sync: z.object({
        tableName: z.string().default('synced_data'),
        debounceMs: z.number().int().nonnegative().default(50),
        conflictStrategy: z.enum(['last-write-wins', 'sheet-wins', 'mysql-wins', 'manual']).default('last-write-wins'),
        batchSize: z.number().int().positive().default(100),
    }),

    // Security
    security: z.object({
        apiKey: z.string().min(16),
        webhookSecret: z.string().min(16),
    }),

    // Rate Limiting
    rateLimit: z.object({
        windowMs: z.number().int().positive().default(60000),
        maxRequests: z.number().int().positive().default(100),
    }),

    // Logging
    logLevel: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): Config {
    const env = process.env;

    // Load Google credentials if path is provided
    let googleCredentials: unknown = undefined;
    const credentialsPath = env['GOOGLE_PRIVATE_KEY_PATH'];
    if (credentialsPath) {
        const resolvedPath = resolve(process.cwd(), credentialsPath);
        if (existsSync(resolvedPath)) {
            try {
                const content = readFileSync(resolvedPath, 'utf-8');
                googleCredentials = JSON.parse(content);
            } catch {
                // Will be handled by validation
            }
        }
    }

    const rawConfig = {
        port: parseInt(env['PORT'] ?? '3000', 10),
        nodeEnv: env['NODE_ENV'] ?? 'development',
        mysql: {
            host: env['MYSQL_HOST'] ?? 'localhost',
            port: parseInt(env['MYSQL_PORT'] ?? '3306', 10),
            user: env['MYSQL_USER'] ?? 'root',
            password: env['MYSQL_PASSWORD'] ?? '',
            database: env['MYSQL_DATABASE'] ?? 'sheets_sync',
        },
        sheets: {
            spreadsheetId: env['GOOGLE_SPREADSHEET_ID'] ?? '',
            sheetName: env['GOOGLE_SHEET_NAME'] ?? 'Sheet1',
            serviceAccountEmail: env['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
            privateKeyPath: env['GOOGLE_PRIVATE_KEY_PATH'],
            credentials: googleCredentials,
        },
        sync: {
            tableName: env['SYNC_TABLE_NAME'] ?? 'synced_data',
            debounceMs: parseInt(env['SYNC_DEBOUNCE_MS'] ?? '50', 10),
            conflictStrategy: env['CONFLICT_STRATEGY'] ?? 'last-write-wins',
            batchSize: parseInt(env['SYNC_BATCH_SIZE'] ?? '100', 10),
        },
        security: {
            apiKey: env['API_KEY'] ?? '',
            webhookSecret: env['WEBHOOK_SECRET'] ?? '',
        },
        rateLimit: {
            windowMs: parseInt(env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
            maxRequests: parseInt(env['RATE_LIMIT_MAX_REQUESTS'] ?? '100', 10),
        },
        logLevel: env['LOG_LEVEL'] ?? 'info',
    };

    return configSchema.parse(rawConfig);
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get the configuration instance (lazy initialization)
 */
export function getConfig(): Config {
    if (!configInstance) {
        configInstance = loadConfig();
    }
    return configInstance;
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
    return getConfig().nodeEnv === 'production';
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
    return getConfig().nodeEnv === 'development';
}

/**
 * Reset config (useful for testing)
 */
export function resetConfig(): void {
    configInstance = null;
}
