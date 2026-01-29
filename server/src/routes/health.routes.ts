// ===========================================
// Health Routes
// ===========================================

import { Router, Request, Response } from 'express';
import { getRedisClient } from '../config/redis.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import * as queueService from '../services/queue.service.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get('/', async (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
        },
    });
});

/**
 * GET /api/health/detailed
 * Detailed health check with service statuses
 */
router.get('/detailed', async (_req: Request, res: Response) => {
    const services: Record<string, { status: string; latency?: number }> = {};

    // Check Redis
    try {
        const start = Date.now();
        const redis = getRedisClient();
        await redis.ping();
        services.redis = { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
        services.redis = { status: 'unhealthy' };
        logger.error('Redis health check failed:', error);
    }

    // Check Supabase
    try {
        const start = Date.now();
        const supabase = getSupabaseAdmin();
        await supabase.from('tenants').select('id').limit(1);
        services.supabase = { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
        services.supabase = { status: 'unhealthy' };
        logger.error('Supabase health check failed:', error);
    }

    // Check Queue
    try {
        const queueStatus = await queueService.getQueueStatus();
        services.queue = {
            status: 'healthy',
            ...queueStatus,
        } as typeof services.queue;
    } catch (error) {
        services.queue = { status: 'unhealthy' };
        logger.error('Queue health check failed:', error);
    }

    const allHealthy = Object.values(services).every((s) => s.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
        success: allHealthy,
        data: {
            status: allHealthy ? 'healthy' : 'degraded',
            services,
            timestamp: new Date().toISOString(),
        },
    });
});

export default router;
