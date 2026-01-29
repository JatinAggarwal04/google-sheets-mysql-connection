import { SyncEngine, SyncEngineConfig } from './sync-engine.js';
import { getConnectionManager, ConnectionManager } from '../mysql/connection-manager.js';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { getCDCListener } from '../mysql/cdc-listener.js';
import { getMySQLClient } from '../mysql/client.js';

const logger = createComponentLogger('MultiSyncCoordinator');

export class MultiSyncCoordinator {
    private engines: Map<string, SyncEngine> = new Map();
    private connectionManager: ConnectionManager;
    private isRunning = false;

    constructor() {
        this.connectionManager = getConnectionManager();
    }

    /**
     * Initialize and start all connections
     */
    async start(): Promise<void> {
        if (this.isRunning) return;

        logger.info('Starting MultiSyncCoordinator');

        // Connect to MySQL first
        const mysqlClient = getMySQLClient();
        await mysqlClient.connect();

        // Ensure metadata table exists
        await this.connectionManager.initialize();

        // Check and migrate legacy config if needed
        // await this.migrateLegacyConfig();

        // Load and start active connections
        await this.refreshConnections();

        // Start CDC Listener globally (it's shared)
        const cdc = getCDCListener();
        try {
            await cdc.start();
            logger.info('Global CDC listener started');
        } catch (error) {
            logger.warn('Failed to start global CDC listener, engines will use polling', { error });
        }

        this.isRunning = true;
    }

    /**
     * Stop all engines
     */
    async stop(): Promise<void> {
        logger.info('Stopping MultiSyncCoordinator');

        for (const [id, engine] of this.engines) {
            await engine.stop();
        }
        this.engines.clear();

        const cdc = getCDCListener();
        await cdc.stop();

        this.isRunning = false;
    }

    /**
     * Migrate .env config to DB if DB is empty
     */
    private async migrateLegacyConfig(): Promise<void> {
        const connections = await this.connectionManager.getAllConnections();
        if (connections.length > 0) {
            return; // Already has connections
        }

        const config = getConfig();
        if (!config.sheets.spreadsheetId) {
            return; // No legacy config
        }

        logger.info('Migrating legacy .env config to database');

        // Infer column mapping? 
        // For now, we don't have mapping in legacy config, it's auto-inferred.
        // We'll store empty mapping and let SyncEngine infer it or UI update it.
        // Actually SyncEngine implementation infers schema from Sheet headers.

        await this.connectionManager.createConnection('system', {
            name: 'Default Connection',
            spreadsheetId: config.sheets.spreadsheetId,
            sheetName: config.sheets.sheetName,
            mysqlTableName: config.sync.tableName,
            columnMapping: {}, // Auto-inferred
            status: 'active'
        });
    }

    /**
     * Refresh connections from DB (add new, remove deleted, update changed)
     */
    async refreshConnections(): Promise<void> {
        const connections = await this.connectionManager.getActiveConnections();
        const activeIds = new Set(connections.map(c => c.id!));

        // Stop and remove engines that are no longer active
        for (const [id, engine] of this.engines) {
            if (!activeIds.has(id)) {
                logger.info(`Stopping sync engine for connection ${id}`);
                await engine.stop();
                this.engines.delete(id);
            }
        }

        // Start new or updated engines
        for (const conn of connections) {
            if (!this.engines.has(conn.id!)) {
                logger.info(`Starting sync engine for connection ${conn.id} (${conn.name})`);
                await this.startEngine(conn);
            }
            // TODO: check if config changed and restart? 
            // For now, assume if ID exists it's same config. 
            // Phase 2 MVP: Restart app or manual refresh for config changes.
        }
    }

    private async startEngine(conn: any): Promise<void> {
        const config: SyncEngineConfig = {
            connectionId: conn.id!,
            tableName: conn.mysqlTableName,
            spreadsheetId: conn.spreadsheetId,
            sheetName: conn.sheetName
        };

        const engine = new SyncEngine(config);

        try {
            await engine.start();
            this.engines.set(conn.id!, engine);
        } catch (error) {
            logger.error(`Failed to start engine for connection ${conn.id}`, { error });
            // Update status to error?
            await this.connectionManager.updateStatus(conn.id!, 'error');
        }

        // Add CDC trigger for this connection's table
        const cdc = getCDCListener();
        const appConfig = getConfig();
        try {
            // Only add if CDC is running (it might be in polling mode if CDC failed start, but here we assume it started)
            // Best effort
            if (cdc.getIsRunning()) {
                await cdc.addTableTrigger(appConfig.mysql.database, conn.mysqlTableName);
            }
        } catch (e) {
            logger.warn(`Failed to add CDC trigger for ${conn.mysqlTableName}`, { error: e });
        }
    }

    /**
     * Get specific engine by ID
     */
    getEngine(connectionId: string): SyncEngine | undefined {
        return this.engines.get(connectionId);
    }

    /**
     * Get default engine (first active) - for legacy API support
     */
    getDefaultEngine(): SyncEngine | undefined {
        if (this.engines.size === 0) return undefined;
        return this.engines.values().next().value;
    }

    /**
     * Get all active engines details
     */
    getEnginesStatus(): any[] {
        return Array.from(this.engines.entries()).map(([id, engine]) => ({
            id,
            status: engine.getStatus()
        }));
    }
}

// Singleton
let instance: MultiSyncCoordinator | null = null;

export function getCoordinator(): MultiSyncCoordinator {
    if (!instance) {
        instance = new MultiSyncCoordinator();
    }
    return instance;
}
