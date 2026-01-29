/**
 * Google Sheets ↔ MySQL 2-Way Sync Platform
 * Main entry point
 */

// Load environment variables FIRST before anything else
import 'dotenv/config';

import { getConfig } from './config/index.js';
import { createComponentLogger, logInfo, logError } from './utils/logger.js';
import { isOperationalError } from './utils/errors.js';
import { getServer } from './server/index.js';
import { getCoordinator } from './sync/coordinator.js';

// ... (logger)

async function shutdown(signal: string): Promise<void> {
    logInfo(`Received ${signal}, starting graceful shutdown`);

    try {
        // Stop coordinator
        const coordinator = getCoordinator();
        await coordinator.stop();

        // Stop HTTP server
        const server = getServer();
        await server.stop();

        logInfo('Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        // ...
    }
}

async function main(): Promise<void> {
    try {
        // Load and validate config
        const config = getConfig();

        logInfo('Starting Google Sheets ↔ MySQL Sync Platform', {
            port: config.port,
            env: config.nodeEnv,
            tableName: config.sync.tableName,
        });

        // Start coordinator
        const coordinator = getCoordinator();
        await coordinator.start();

        // Start HTTP server
        const server = getServer();
        await server.start();

        logInfo('Platform started successfully', {
            dashboardUrl: `http://localhost:${config.port}`,
            apiUrl: `http://localhost:${config.port}/api`,
        });

        // Register shutdown handlers
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error: Error) => {
            logError('Uncaught exception', { error });

            if (!isOperationalError(error)) {
                // Non-operational error, crash
                process.exit(1);
            }
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason: unknown) => {
            logError('Unhandled rejection', {
                error: reason instanceof Error ? reason : new Error(String(reason))
            });
        });

    } catch (error) {
        logError('Failed to start platform', { error });
        process.exit(1);
    }
}

// Run
main();
