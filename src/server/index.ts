import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer, Server as HttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../config/index.js';
import { createComponentLogger, logHttp } from '../utils/logger.js';
import { AppError, isOperationalError, serializeError } from '../utils/errors.js';
import { webhookRouter } from './routes/webhook.js';
import { syncRouter } from './routes/sync.js';
import { healthRouter } from './routes/health.js';
import { WebSocketServer } from './websocket.js';
import { getSyncEngine } from '../sync/sync-engine.js';

const logger = createComponentLogger('Server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure the Express application
 */
export function createApp(): Express {
    const app = express();
    const config = getConfig();

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                connectSrc: ["'self'", "ws:", "wss:"],
            },
        },
    }));

    // Rate limiting
    const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.maxRequests,
        message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api/', limiter);

    // Body parsing
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Request logging
    app.use((req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();

        res.on('finish', () => {
            logHttp(`${req.method} ${req.path}`, {
                duration: Date.now() - start,
                status: res.statusCode,
                ip: req.ip,
            });
        });

        next();
    });

    // Static files for dashboard
    const publicPath = path.resolve(__dirname, '../../public');
    app.use(express.static(publicPath));

    // API routes
    app.use('/api/webhook', webhookRouter);
    app.use('/api/sync', syncRouter);
    app.use('/api/health', healthRouter);

    // Serve dashboard for root
    app.get('/', (req: Request, res: Response) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    // 404 handler
    app.use((req: Request, res: Response) => {
        res.status(404).json({
            error: {
                code: 'NOT_FOUND',
                message: `Route ${req.method} ${req.path} not found`,
            },
        });
    });

    // Error handler
    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error('Unhandled error in request', {
            error: err,
            path: req.path,
            method: req.method,
        });

        if (err instanceof AppError) {
            res.status(err.statusCode).json(err.toJSON());
            return;
        }

        // Don't expose internal errors in production
        const statusCode = 500;
        const message = isOperationalError(err)
            ? err.message
            : 'Internal server error';

        res.status(statusCode).json({
            error: {
                code: 'INTERNAL_ERROR',
                message,
            },
        });
    });

    return app;
}

/**
 * HTTP Server wrapper with WebSocket support
 */
export class AppServer {
    private app: Express;
    private server: HttpServer | null = null;
    private wsServer: WebSocketServer | null = null;

    constructor() {
        this.app = createApp();
    }

    /**
     * Start the server
     */
    async start(): Promise<void> {
        const config = getConfig();

        return new Promise((resolve, reject) => {
            try {
                this.server = createServer(this.app);

                // Initialize WebSocket server
                this.wsServer = new WebSocketServer(this.server);

                // Connect sync engine events to WebSocket
                this.connectSyncEvents();

                this.server.listen(config.port, () => {
                    logger.info('Server started', {
                        port: config.port,
                        env: config.nodeEnv,
                    });
                    resolve();
                });

                this.server.on('error', (error: Error) => {
                    logger.error('Server error', { error });
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Connect sync engine events to WebSocket broadcasts
     */
    private connectSyncEvents(): void {
        if (!this.wsServer) return;

        const syncEngine = getSyncEngine();

        syncEngine.on('sync:start', () => {
            this.wsServer?.broadcast({
                type: 'sync:start',
                timestamp: Date.now(),
            });
        });

        syncEngine.on('sync:complete', (stats) => {
            this.wsServer?.broadcast({
                type: 'sync:complete',
                data: stats,
                timestamp: Date.now(),
            });
        });

        syncEngine.on('sync:error', (error) => {
            this.wsServer?.broadcast({
                type: 'sync:error',
                data: { message: error.message },
                timestamp: Date.now(),
            });
        });

        syncEngine.on('change:processed', (event) => {
            this.wsServer?.broadcast({
                type: 'change:processed',
                data: {
                    id: event.id,
                    origin: event.origin,
                    operation: event.operation,
                    rowId: event.rowId,
                },
                timestamp: Date.now(),
            });
        });

        syncEngine.on('conflict:detected', (conflict) => {
            this.wsServer?.broadcast({
                type: 'conflict:detected',
                data: {
                    sheetRowId: conflict.sheetEvent.rowId,
                    mysqlRowId: conflict.mysqlEvent.rowId,
                },
                timestamp: Date.now(),
            });
        });

        syncEngine.on('conflict:resolved', (resolution) => {
            this.wsServer?.broadcast({
                type: 'conflict:resolved',
                data: resolution,
                timestamp: Date.now(),
            });
        });

        syncEngine.on('status:update', (status) => {
            this.wsServer?.broadcast({
                type: 'status:update',
                data: status,
                timestamp: Date.now(),
            });
        });

        logger.debug('Sync events connected to WebSocket');
    }

    /**
     * Get the WebSocket server instance
     */
    getWebSocketServer(): WebSocketServer | null {
        return this.wsServer;
    }

    /**
     * Stop the server
     */
    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.wsServer) {
                this.wsServer.close();
            }

            if (this.server) {
                this.server.close(() => {
                    logger.info('Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// Singleton instance
let serverInstance: AppServer | null = null;

/**
 * Get the server singleton
 */
export function getServer(): AppServer {
    if (!serverInstance) {
        serverInstance = new AppServer();
    }
    return serverInstance;
}
