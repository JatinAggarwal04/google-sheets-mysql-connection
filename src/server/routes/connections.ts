import { Router, Request, Response } from 'express';
import { getConnectionManager } from '../../mysql/connection-manager.js';
import { getCoordinator } from '../../sync/coordinator.js';
import { getSheetsClient } from '../../sheets/client.js';
import { createComponentLogger } from '../../utils/logger.js';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const logger = createComponentLogger('ConnectionsRoute');
export const connectionsRouter = Router();

const connectionManager = getConnectionManager();
const coordinator = getCoordinator();

// Validation schemas
const createConnectionSchema = z.object({
    name: z.string().min(1),
    spreadsheetId: z.string().min(1),
    sheetName: z.string().min(1),
    mysqlTableName: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
    columnMapping: z.record(z.string()), // user -> system (sheet header -> type? or just mapping)
});

// Protect all routes
connectionsRouter.use(requireAuth);

/**
 * GET /api/connections
 * List all connections
 */
connectionsRouter.get('/', async (req: Request, res: Response) => {
    try {
        if (!req.user) return; // Should be handled by middleware

        const connections = await connectionManager.getAllConnections(req.user.id);

        // Enrich with runtime status
        const statuses = coordinator.getEnginesStatus();
        const statusMap = new Map(statuses.map(s => [s.id, s.status]));

        const enriched = connections.map(conn => ({
            ...conn,
            runtimeStatus: statusMap.get(conn.id!) || { isRunning: false }
        }));

        res.json(enriched);
    } catch (error) {
        logger.error('Failed to list connections', { error });
        res.status(500).json({ error: 'Failed to list connections' });
    }
});

/**
 * GET /api/connections/:id
 * Get connection details
 */
connectionsRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const id = parseInt(req.params['id'] || '0', 10);
        const connection = await connectionManager.getConnection(req.user.id, id);

        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        res.json(connection);
    } catch (error) {
        logger.error('Failed to get connection', { error });
        res.status(500).json({ error: 'Failed to get connection' });
    }
});

/**
 * POST /api/connections/preview
 * Preview Sheet Headers
 */
connectionsRouter.post('/preview', async (req: Request, res: Response) => {
    try {
        const { spreadsheetId, sheetName } = req.body;

        if (!spreadsheetId || !sheetName) {
            res.status(400).json({ error: 'Missing spreadsheetId or sheetName' });
            return;
        }

        // Use ephemeral client
        const client = getSheetsClient({ spreadsheetId, sheetName });
        const data = await client.getSheetData();

        res.json({
            headers: data.headers,
            rowCount: data.rows.length
        });
    } catch (error) {
        logger.error('Failed to preview sheet', { error });
        res.status(400).json({
            error: 'Failed to access Google Sheet. Check ID and permissions.',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * POST /api/connections
 * Create new connection
 */
connectionsRouter.post('/', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const body = createConnectionSchema.parse(req.body);

        // Create in DB
        const id = await connectionManager.createConnection(req.user.id, {
            ...body,
            status: 'active'
        });

        // Refresh coordinator to include new connection
        // This will start the SyncEngine, which will perform initial sync/inference/table creation.
        await coordinator.refreshConnections();

        res.status(201).json({
            success: true,
            id,
            message: 'Connection created and sync started'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation error', details: error.errors });
            return;
        }
        logger.error('Failed to create connection', { error });
        res.status(500).json({ error: 'Failed to create connection' });
    }
});

/**
 * DELETE /api/connections/:id
 * Delete connection
 */
connectionsRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const id = parseInt(req.params['id'] || '0', 10);

        await connectionManager.deleteConnection(req.user.id, id);
        await coordinator.refreshConnections();

        res.json({ success: true, message: 'Connection deleted' });
    } catch (error) {
        logger.error('Failed to delete connection', { error });
        res.status(500).json({ error: 'Failed to delete connection' });
    }
});

/**
 * POST /api/connections/:id/pause
 */
connectionsRouter.post('/:id/pause', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const id = parseInt(req.params['id'] || '0', 10);

        // Verify ownership
        const connection = await connectionManager.getConnection(req.user.id, id);
        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        await connectionManager.updateStatus(id, 'paused');
        await coordinator.refreshConnections();
        res.json({ success: true, message: 'Connection paused' });
    } catch (error) {
        logger.error('Failed to pause connection', { error });
        res.status(500).json({ error: 'Failed to pause connection' });
    }
});

/**
 * POST /api/connections/:id/resume
 */
connectionsRouter.post('/:id/resume', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const id = parseInt(req.params['id'] || '0', 10);

        // Verify ownership
        const connection = await connectionManager.getConnection(req.user.id, id);
        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        await connectionManager.updateStatus(id, 'active');
        await coordinator.refreshConnections();
        res.json({ success: true, message: 'Connection resumed' });
    } catch (error) {
        logger.error('Failed to resume connection', { error });
        res.status(500).json({ error: 'Failed to resume connection' });
    }
});
