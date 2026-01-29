// ===========================================
// Environment Configuration
// ===========================================

import { z } from 'zod';

const envSchema = z.object({
    // Server
    PORT: z.string().default('3001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Supabase
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().url(),

    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().default('6379'),
    REDIS_PASSWORD: z.string().optional(),

    // Encryption
    ENCRYPTION_KEY: z.string().min(32),

    // JWT
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRY: z.string().default('7d'),

    // Client
    CLIENT_URL: z.string().url().default('http://localhost:5173'),

    // Logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
    if (cachedEnv) return cachedEnv;

    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Environment validation failed:');
        console.error(result.error.format());
        throw new Error('Invalid environment configuration');
    }

    cachedEnv = result.data;
    return cachedEnv;
}

export function getEnv(): Env {
    if (!cachedEnv) {
        throw new Error('Environment not loaded. Call loadEnv() first.');
    }
    return cachedEnv;
}
