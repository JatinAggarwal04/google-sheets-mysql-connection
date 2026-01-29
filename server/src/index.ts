// ===========================================
// Server Entry Point
// ===========================================

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadEnv, getEnv, connectRedis } from './config/index.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/index.js';
import routes from './routes/index.js';
import { startSyncWorker, shutdownQueue } from './services/queue.service.js';
import { processSyncJob } from './services/sync.service.js';
import { closeAllPools } from './services/mysql.service.js';

// Load and validate environment
loadEnv();

const app = express();
const env = getEnv();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// API routes
app.use('/api', routes);

// Root route
app.get('/', (_req, res) => {
    res.json({
        name: 'Google Sheets MySQL Sync API',
        version: '1.0.0',
        status: 'running',
    });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
async function shutdown() {
    logger.info('Shutting down...');

    await shutdownQueue();
    await closeAllPools();

    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
    try {
        // Connect to Redis
        await connectRedis();
        logger.info('Connected to Redis');

        // Start sync worker
        startSyncWorker(processSyncJob);
        logger.info('Sync worker started');

        // Start HTTP server
        const port = parseInt(env.PORT, 10);
        app.listen(port, () => {
            logger.info(`Server running on port ${port}`);
            logger.info(`Environment: ${env.NODE_ENV}`);
            console.log('\n========================================');
            console.log('  Google Sheets ↔ MySQL Sync Platform');
            console.log('========================================\n');
            console.log('  Please open the application manually in your browser at:\n');
            console.log(`  🌐 http://localhost:${port}\n`);
            console.log('  API Documentation:');
            console.log(`  📚 http://localhost:${port}/api/health\n`);
            console.log('========================================\n');
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
