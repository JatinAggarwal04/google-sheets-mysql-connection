// ===========================================
// Redis Configuration
// ===========================================

import Redis from 'ioredis';
import { getEnv } from './env.js';
import { logger } from '../lib/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
    if (redisClient) return redisClient;

    const env = getEnv();

    redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        lazyConnect: true,
    });

    redisClient.on('connect', () => {
        logger.info('Redis connected');
    });

    redisClient.on('error', (err) => {
        logger.error('Redis error:', err);
    });

    redisClient.on('close', () => {
        logger.warn('Redis connection closed');
    });

    return redisClient;
}

export async function connectRedis(): Promise<void> {
    const client = getRedisClient();
    await client.connect();
}

export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
