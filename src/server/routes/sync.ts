import { Router, Request, Response } from 'express';
import { getConfig } from '../../config/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import { AuthenticationError } from '../../utils/errors.js';
import { getSyncEngine } from '../../sync/sync-engine.js';
import { getConflictResolver } from '../../sync/conflict-resolver.js';
import { getChangeQueue } from '../../sync/change-queue.js';

const logger = createComponentLogger('SyncRoute');

export const syncRouter = Router();

/**
 * API key authentication middleware
 */
function authenticateApiKey(req: Request, res: Response, next: () => void): void {
    const config = getConfig();
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey || apiKey !== config.security.apiKey) {
        res.status(401).json({
            error: {
                code: 'AUTHENTICATION_FAILED',
                message: 'Invalid or missing API key',
            },
        });
        return;
    }

    next();
}

/**
 * GET /api/sync/status
 * Get current sync status
 */
syncRouter.get('/status', (req: Request, res: Response) => {
    try {
        const syncEngine = getSyncEngine();
        const status = syncEngine.getStatus();
        const queueStats = getChangeQueue().getStats();

        res.json({
            ...status,
            queue: queueStats,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Error getting sync status', { error });
        res.status(500).json({
            error: {
                code: 'STATUS_ERROR',
                message: 'Failed to get sync status',
            },
        });
    }
});

/**
 * POST /api/sync/trigger
 * Trigger a full sync manually (requires API key)
 */
syncRouter.post('/trigger', authenticateApiKey, async (req: Request, res: Response) => {
    try {
        logger.info('Manual sync triggered via API');

        const syncEngine = getSyncEngine();

        // Start sync in background
        syncEngine.triggerFullSync().catch((error: Error) => {
            logger.error('Background sync failed', { error });
        });

        res.status(202).json({
            success: true,
            message: 'Full sync triggered',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Error triggering sync', { error });
        res.status(500).json({
            error: {
                code: 'SYNC_TRIGGER_ERROR',
                message: 'Failed to trigger sync',
            },
        });
    }
});

/**
 * GET /api/sync/conflicts
 * Get pending conflicts
 */
syncRouter.get('/conflicts', (req: Request, res: Response) => {
    try {
        const resolver = getConflictResolver();
        const conflicts = resolver.getPendingConflicts();

        res.json({
            count: conflicts.length,
            conflicts: conflicts.map(c => ({
                id: c.id,
                rowId: c.sheetEvent.rowId,
                detectedAt: new Date(c.detectedAt).toISOString(),
                status: c.status,
                sheetValue: c.sheetEvent.data,
                mysqlValue: c.mysqlEvent.data,
            })),
        });
    } catch (error) {
        logger.error('Error getting conflicts', { error });
        res.status(500).json({
            error: {
                code: 'CONFLICTS_ERROR',
                message: 'Failed to get conflicts',
            },
        });
    }
});

/**
 * POST /api/sync/conflicts/:id/resolve
 * Manually resolve a conflict (requires API key)
 */
syncRouter.post('/conflicts/:id/resolve', authenticateApiKey, (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { resolution, mergedData } = req.body as {
            resolution: 'sheet-wins' | 'mysql-wins';
            mergedData?: Record<string, unknown>;
        };

        if (!resolution || !['sheet-wins', 'mysql-wins'].includes(resolution)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_RESOLUTION',
                    message: 'Resolution must be "sheet-wins" or "mysql-wins"',
                },
            });
            return;
        }

        const resolver = getConflictResolver();
        const result = resolver.manuallyResolve(id ?? '', resolution, mergedData);

        if (!result) {
            res.status(404).json({
                error: {
                    code: 'CONFLICT_NOT_FOUND',
                    message: 'Conflict not found or already resolved',
                },
            });
            return;
        }

        logger.info('Conflict manually resolved via API', {
            conflictId: id,
            resolution: result.winner,
        });

        res.json({
            success: true,
            resolution: result.winner,
            data: result.data,
        });
    } catch (error) {
        logger.error('Error resolving conflict', { error });
        res.status(500).json({
            error: {
                code: 'RESOLVE_ERROR',
                message: 'Failed to resolve conflict',
            },
        });
    }
});

/**
 * GET /api/sync/queue
 * Get queue statistics
 */
syncRouter.get('/queue', (req: Request, res: Response) => {
    try {
        const queue = getChangeQueue();
        const stats = queue.getStats();

        res.json(stats);
    } catch (error) {
        logger.error('Error getting queue stats', { error });
        res.status(500).json({
            error: {
                code: 'QUEUE_ERROR',
                message: 'Failed to get queue statistics',
            },
        });
    }
});
