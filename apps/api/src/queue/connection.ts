import Redis from 'ioredis';
import { config } from '../config/index.js';

let connection: Redis | null = null;

export const getRedisConnection = (): Redis => {
    if (!connection) {
        connection = new Redis(config.redisUrl, {
            maxRetriesPerRequest: null, // Critical configuration for BullMQ
            enableReadyCheck: false,
        });

        connection.on('error', (err) => {
            console.error('Redis connection error:', err);
        });

        connection.on('connect', () => {
            console.log('Redis connected');
        });
    }
    return connection;
};
