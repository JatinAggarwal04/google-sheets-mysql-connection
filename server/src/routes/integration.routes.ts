// ===========================================
// Integration Routes
// ===========================================

import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { createIntegrationSchema } from '../types/api.js';
import * as integrationService from '../services/integration.service.js';
import * as syncService from '../services/sync.service.js';
import * as queueService from '../services/queue.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/integrations
 * List integrations
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const integrations = await integrationService.listIntegrations(req.tenant!.id);

        res.json({
            success: true,
            data: integrations,
        });
    } catch (error) {
        logger.error('Failed to list integrations:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list integrations' },
        });
    }
});

/**
 * POST /api/integrations
 * Create integration (triggers initial sync)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const validation = createIntegrationSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                    details: validation.error.format(),
                },
            });
        }

        const integration = await integrationService.createIntegration(
            req.tenant!.id,
            validation.data
        );

        res.status(201).json({
            success: true,
            data: integration,
        });
    } catch (error) {
        logger.error('Failed to create integration:', error);

        const message = error instanceof Error ? error.message : 'Failed to create integration';
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message },
        });
    }
});

/**
 * GET /api/integrations/:id
 * Get integration details
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const integration = await integrationService.getIntegration(
            req.tenant!.id,
            req.params.id
        );

        const mappings = await integrationService.getColumnMappings(req.params.id);
        const syncState = await integrationService.getSyncState(req.params.id);

        res.json({
            success: true,
            data: {
                integration,
                mappings,
                syncState,
            },
        });
    } catch (error) {
        logger.error('Failed to get integration:', error);
        res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Integration not found' },
        });
    }
});

/**
 * DELETE /api/integrations/:id
 * Delete integration
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        await integrationService.deleteIntegration(req.tenant!.id, req.params.id);

        res.json({
            success: true,
            data: { message: 'Integration deleted' },
        });
    } catch (error) {
        logger.error('Failed to delete integration:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to delete integration' },
        });
    }
});

/**
 * POST /api/integrations/:id/pause
 * Pause integration
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
    try {
        await integrationService.pauseIntegration(req.tenant!.id, req.params.id);

        res.json({
            success: true,
            data: { message: 'Integration paused' },
        });
    } catch (error) {
        logger.error('Failed to pause integration:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to pause integration' },
        });
    }
});

/**
 * POST /api/integrations/:id/resume
 * Resume integration
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
    try {
        await integrationService.resumeIntegration(req.tenant!.id, req.params.id);

        res.json({
            success: true,
            data: { message: 'Integration resumed' },
        });
    } catch (error) {
        logger.error('Failed to resume integration:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to resume integration' },
        });
    }
});

/**
 * GET /api/integrations/:id/logs
 * Get sync logs
 */
router.get('/:id/logs', async (req: Request, res: Response) => {
    try {
        // Verify ownership
        await integrationService.getIntegration(req.tenant!.id, req.params.id);

        const logs = await syncService.getSyncLogs(req.params.id);

        res.json({
            success: true,
            data: logs,
        });
    } catch (error) {
        logger.error('Failed to get sync logs:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get logs' },
        });
    }
});

/**
 * GET /api/integrations/:id/jobs
 * Get queue jobs for integration
 */
router.get('/:id/jobs', async (req: Request, res: Response) => {
    try {
        // Verify ownership
        await integrationService.getIntegration(req.tenant!.id, req.params.id);

        const status = (req.query.status as 'completed' | 'failed' | 'waiting' | 'active') || 'completed';
        const jobs = await queueService.getIntegrationJobs(req.params.id, status);

        res.json({
            success: true,
            data: jobs.map((job) => ({
                id: job.id,
                name: job.name,
                data: job.data,
                progress: job.progress,
                attemptsMade: job.attemptsMade,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
                failedReason: job.failedReason,
            })),
        });
    } catch (error) {
        logger.error('Failed to get jobs:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get jobs' },
        });
    }
});

/**
 * POST /api/integrations/:id/sync
 * Trigger manual sync
 */
router.post('/:id/sync', async (req: Request, res: Response) => {
    try {
        await integrationService.triggerSync(req.tenant!.id, req.params.id);

        res.json({
            success: true,
            data: { message: 'Sync triggered' },
        });
    } catch (error) {
        logger.error('Failed to trigger sync:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to trigger sync' },
        });
    }
});

export default router;
