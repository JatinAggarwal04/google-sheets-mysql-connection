import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
    port: z.string().transform(Number).default('3000'),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

    // Database (Supabase)
    supabaseUrl: z.string().min(1, 'SUPABASE_URL is required'),
    supabaseServiceKey: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),
    supabaseAnonKey: z.string().min(1, 'SUPABASE_ANON_KEY is required'),

    // Security
    encryptionKey: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 chars'),

    // Google OAuth
    googleClientId: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
    googleClientSecret: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
    googleRedirectUri: z.string().default('http://localhost:3000/api/auth/google/callback'),

    // Redis (for Queues)
    redisUrl: z.string().default('redis://localhost:6379'),
});

const parseConfig = () => {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
        console.error('❌ Invalid environment variables:', parsed.error.format());
        process.exit(1);
    }
    return parsed.data;
};

export const config = parseConfig();
