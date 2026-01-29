import { Router, Request, Response } from 'express';
import { getMySQLClient } from '../../mysql/client.js';
import { getSheetsClient } from '../../sheets/client.js';
import { getCDCListener } from '../../mysql/cdc-listener.js';

export const healthRouter = Router();

/**
 * GET /api/health
 * Basic health check
 */
healthRouter.get('/', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

/**
 * GET /api/health/detailed
 * Detailed health check with component status
 */
healthRouter.get('/detailed', async (req: Request, res: Response) => {
    const components: Record<string, { status: string; message?: string }> = {};

    // Check MySQL
    try {
        const mysqlClient = getMySQLClient();
        if (mysqlClient.getIsConnected()) {
            components['mysql'] = { status: 'healthy' };
        } else {
            components['mysql'] = { status: 'disconnected', message: 'Not connected' };
        }
    } catch (error) {
        components['mysql'] = {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }

    // Check Google Sheets client
    try {
        const sheetsClient = getSheetsClient();
        if (sheetsClient.getIsInitialized()) {
            components['sheets'] = { status: 'healthy' };
        } else {
            components['sheets'] = { status: 'not_initialized', message: 'Client not initialized' };
        }
    } catch (error) {
        components['sheets'] = {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }

    // Check CDC Listener
    try {
        const cdcListener = getCDCListener();
        if (cdcListener.getIsRunning()) {
            components['cdc'] = { status: 'healthy' };
        } else {
            components['cdc'] = { status: 'stopped', message: 'CDC listener not running' };
        }
    } catch (error) {
        components['cdc'] = {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }

    // Determine overall health
    const allHealthy = Object.values(components).every(c => c.status === 'healthy');
    const anyError = Object.values(components).some(c => c.status === 'error');

    const overallStatus = allHealthy ? 'healthy' : anyError ? 'unhealthy' : 'degraded';

    res.status(overallStatus === 'healthy' ? 200 : 503).json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        components,
    });
});

/**
 * GET /api/health/ready
 * Readiness check for load balancers
 */
healthRouter.get('/ready', (req: Request, res: Response) => {
    const mysqlClient = getMySQLClient();
    const sheetsClient = getSheetsClient();

    const isReady = mysqlClient.getIsConnected() && sheetsClient.getIsInitialized();

    if (isReady) {
        res.json({ ready: true });
    } else {
        res.status(503).json({ ready: false });
    }
});

/**
 * GET /api/health/live
 * Liveness check for container orchestration
 */
healthRouter.get('/live', (req: Request, res: Response) => {
    res.json({ alive: true });
});
