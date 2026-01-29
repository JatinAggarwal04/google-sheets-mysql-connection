// ===========================================
// MySQL Routes
// ===========================================

import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { mysqlConnectionSchema } from '../types/api.js';
import * as mysqlService from '../services/mysql.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/mysql/connections
 * List MySQL connections
 */
router.get('/connections', async (req: Request, res: Response) => {
    try {
        const connections = await mysqlService.listMySQLConnections(req.tenant!.id);

        // Remove sensitive data
        const safeConnections = connections.map((c) => ({
            id: c.id,
            name: c.name,
            host: c.host,
            port: c.port,
            database: c.database,
            isValid: c.is_valid,
            createdAt: c.created_at,
        }));

        res.json({
            success: true,
            data: safeConnections,
        });
    } catch (error) {
        logger.error('Failed to list MySQL connections:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list connections' },
        });
    }
});

/**
 * POST /api/mysql/connections
 * Create MySQL connection
 */
router.post('/connections', async (req: Request, res: Response) => {
    try {
        const validation = mysqlConnectionSchema.safeParse(req.body);

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

        const connection = await mysqlService.createMySQLConnection(
            req.tenant!.id,
            validation.data
        );

        res.status(201).json({
            success: true,
            data: {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                isValid: connection.is_valid,
                createdAt: connection.created_at,
            },
        });
    } catch (error) {
        logger.error('Failed to create MySQL connection:', error);

        const message = error instanceof Error ? error.message : 'Failed to create connection';
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message },
        });
    }
});

/**
 * POST /api/mysql/connections/test
 * Test MySQL connection
 */
router.post('/connections/test', async (req: Request, res: Response) => {
    try {
        const validation = mysqlConnectionSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                },
            });
        }

        const { host, port, database, username, password } = validation.data;
        const isValid = await mysqlService.testConnection(host, port, database, username, password);

        res.json({
            success: true,
            data: { connected: isValid },
        });
    } catch (error) {
        logger.error('Connection test failed:', error);
        res.json({
            success: true,
            data: { connected: false },
        });
    }
});

/**
 * DELETE /api/mysql/connections/:id
 * Delete MySQL connection
 */
router.delete('/connections/:id', async (req: Request, res: Response) => {
    try {
        await mysqlService.deleteMySQLConnection(req.tenant!.id, req.params.id);

        res.json({
            success: true,
            data: { message: 'Connection deleted' },
        });
    } catch (error) {
        logger.error('Failed to delete MySQL connection:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to delete connection' },
        });
    }
});

/**
 * GET /api/mysql/connections/:id/tables
 * List tables in database
 */
router.get('/connections/:id/tables', async (req: Request, res: Response) => {
    try {
        // Verify ownership
        await mysqlService.getMySQLConnection(req.tenant!.id, req.params.id);

        const tables = await mysqlService.listTables(req.params.id);

        res.json({
            success: true,
            data: tables,
        });
    } catch (error) {
        logger.error('Failed to list tables:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list tables' },
        });
    }
});

/**
 * GET /api/mysql/connections/:id/tables/:tableName/schema
 * Get table schema
 */
router.get('/connections/:id/tables/:tableName/schema', async (req: Request, res: Response) => {
    try {
        // Verify ownership
        await mysqlService.getMySQLConnection(req.tenant!.id, req.params.id);

        const schema = await mysqlService.getTableSchema(
            req.params.id,
            req.params.tableName
        );

        res.json({
            success: true,
            data: schema,
        });
    } catch (error) {
        logger.error('Failed to get table schema:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get table schema' },
        });
    }
});

export default router;
