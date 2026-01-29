import { EventEmitter } from 'events';
import { ChangeEvent, ChangeOrigin, SyncStatus, createChangeEvent } from './change-event.js';
import { getChangeQueue, ChangeQueue } from './change-queue.js';
import { getConflictResolver, ConflictResolver } from './conflict-resolver.js';
import { getMySQLClient, MySQLClient } from '../mysql/client.js';
import { getCDCListener, CDCListener } from '../mysql/cdc-listener.js';
import { getPollingListener, MySQLPollingListener } from '../mysql/polling-listener.js';
import { getSheetsClient, SheetsClient } from '../sheets/client.js';
import { createSchemaManager, SchemaManager } from '../mysql/schema-manager.js';
import { createSchemaInferrer } from '../sheets/schema-inferrer.js';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { SyncError } from '../utils/errors.js';
import { RowDataPacket } from 'mysql2/promise';

const logger = createComponentLogger('SyncEngine');

/**
 * Sync engine event types
 */
export interface SyncEngineEvents {
    'sync:start': () => void;
    'sync:complete': (stats: { duration: number; processed: number }) => void;
    'sync:error': (error: Error) => void;
    'change:processed': (event: ChangeEvent) => void;
    'conflict:detected': (conflict: { sheetEvent: ChangeEvent; mysqlEvent: ChangeEvent }) => void;
    'conflict:resolved': (resolution: { winner: string; data: Record<string, unknown> }) => void;
    'status:update': (status: SyncStatus) => void;
}

export interface SyncEngineConfig {
    connectionId?: number;
    tableName: string;
    spreadsheetId: string;
    sheetName: string;
}

/**
 * Main sync engine that orchestrates bidirectional synchronization
 */
export class SyncEngine extends EventEmitter {
    private mysqlClient: MySQLClient;
    private sheetsClient: SheetsClient;
    private cdcListener: CDCListener;
    private pollingListener: MySQLPollingListener;
    private changeQueue: ChangeQueue;
    private conflictResolver: ConflictResolver;
    private schemaManager: SchemaManager;

    private isRunning = false;
    private isSyncing = false;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private headers: string[] = [];
    private tableName: string;

    constructor(config?: SyncEngineConfig) {
        super();
        const globalConfig = getConfig();

        // Use provided config or fall back to global
        const sheetConfig = config ? {
            spreadsheetId: config.spreadsheetId,
            sheetName: config.sheetName
        } : undefined;

        this.tableName = config?.tableName ?? globalConfig.sync.tableName;

        this.mysqlClient = getMySQLClient();
        this.sheetsClient = getSheetsClient(sheetConfig);
        this.cdcListener = getCDCListener();
        this.pollingListener = getPollingListener(this.tableName); // Specific listener for this table
        this.changeQueue = getChangeQueue();
        this.conflictResolver = getConflictResolver();

        this.schemaManager = createSchemaManager(globalConfig.mysql.database);
    }

    /**
     * Initialize and start the sync engine
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('Sync engine already running');
            return;
        }

        logger.info('Starting sync engine');

        try {
            // Initialize connections
            await this.mysqlClient.connect();
            await this.sheetsClient.initialize();

            // Perform initial sync to set up schema
            await this.performInitialSync();

            // Set up CDC listener for MySQL changes (optional - for bidirectional sync)
            this.cdcListener.on('change', (event: ChangeEvent) => {
                this.handleMySQLChange(event);
            });

            try {
                await this.cdcListener.start();
                logger.info('CDC listener started - bidirectional sync enabled');
            } catch (cdcError) {
                const cause = cdcError instanceof Error && 'cause' in cdcError ? (cdcError as any).cause : undefined;
                logger.warn('CDC listener failed to start - running in one-way mode (Sheet → MySQL only)', {
                    error: cdcError instanceof Error ? cdcError.message : String(cdcError),
                    cause: cause instanceof Error ? cause.message : cause,
                    stack: cdcError instanceof Error ? cdcError.stack : undefined
                });

                // Fallback to polling
                logger.info('Falling back to polling listener');
                this.pollingListener.on('change', (event: ChangeEvent) => {
                    this.handleMySQLChange(event);
                });
                await this.pollingListener.start();
            }

            // Start processing loop
            this.startProcessingLoop();

            this.isRunning = true;
            this.emitStatus();

            logger.info('Sync engine started successfully');
        } catch (error) {
            logger.error('Failed to start sync engine', { error });
            throw new SyncError('Failed to start sync engine', {
                context: { error: String(error) },
            });
        }
    }

    /**
     * Perform initial sync - load Sheet data into MySQL
     */
    async performInitialSync(): Promise<void> {
        logger.info('Performing initial sync');

        const startTime = Date.now();
        this.isSyncing = true;
        this.emit('sync:start');
        this.emitStatus();

        try {
            // Get Sheet data
            const sheetData = await this.sheetsClient.getSheetData();
            this.headers = sheetData.headers;

            if (this.headers.length === 0) {
                logger.warn('Sheet has no headers, skipping initial sync');
                return;
            }

            // Infer schema from Sheet data
            const inferrer = createSchemaInferrer();
            const schema = inferrer.inferSchema(this.headers, sheetData.rows);

            // Ensure table exists with correct schema
            await this.schemaManager.ensureTable(this.tableName, schema.columns);

            // Get existing MySQL data for comparison
            const existingRows = await this.mysqlClient.getAllRows<RowDataPacket & { _row_number: number }>(this.tableName);
            const existingByRowNumber = new Map(
                existingRows.map(row => [row._row_number, row])
            );

            // Sync each row from Sheet to MySQL
            let processed = 0;
            for (const row of sheetData.rows) {
                const existing = existingByRowNumber.get(row.rowNumber);

                if (existing) {
                    // Update existing row
                    await this.mysqlClient.updateRow(
                        this.tableName,
                        existing.id as number,
                        { ...this.sanitizeData(row.data), _row_number: row.rowNumber },
                        'id',
                        'INITIAL_SYNC'
                    );
                } else {
                    // Insert new row
                    await this.mysqlClient.insertRow(
                        this.tableName,
                        { ...this.sanitizeData(row.data), _row_number: row.rowNumber },
                        'INITIAL_SYNC'
                    );
                }
                processed++;
            }

            const duration = Date.now() - startTime;
            logger.info('Initial sync complete', { processed, duration });
            this.emit('sync:complete', { duration, processed });
        } catch (error) {
            logger.error('Initial sync failed', { error });
            this.emit('sync:error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            this.isSyncing = false;
            this.emitStatus();
        }
    }

    /**
     * Handle incoming Sheet change (from webhook)
     */
    handleSheetChange(changeData: {
        row: number;
        column: number;
        operationType: string;
        rowData?: Record<string, unknown>;
        oldValue?: unknown;
        newValue?: unknown;
        editedBy?: string;
    }): void {
        const operation = this.mapOperationType(changeData.operationType);

        // Skip header changes
        if (changeData.row === 1) {
            logger.debug('Skipping header change');
            return;
        }

        const eventOptions: Partial<Pick<ChangeEvent, 'previousData' | 'userId' | 'changedColumns' | 'sheetRange'>> = {};

        if (changeData.editedBy) {
            eventOptions.userId = changeData.editedBy;
        }

        if (changeData.column) {
            eventOptions.changedColumns = [this.headers[changeData.column - 1] ?? `column_${changeData.column}`];
        }

        const event = createChangeEvent(
            ChangeOrigin.SHEET,
            operation,
            this.tableName,
            changeData.row,
            changeData.rowData ?? {},
            Object.keys(eventOptions).length > 0 ? eventOptions : undefined
        );

        logger.info('Sheet change received', {
            eventId: event.id,
            operation,
            row: changeData.row,
            editedBy: changeData.editedBy,
        });

        this.changeQueue.enqueue(event);
        this.emitStatus();
    }

    /**
     * Handle MySQL change (from CDC)
     */
    private handleMySQLChange(event: ChangeEvent): void {
        // Filter events not for this table (crucial for CDC which is global)
        if (event.tableName !== this.tableName) {
            return;
        }

        logger.info('MySQL change detected', {
            eventId: event.id,
            operation: event.operation,
            rowId: event.rowId,
            table: this.tableName
        });

        // Check for potential conflict
        const sheetEvents = this.changeQueue.getEventsForRow(event.tableName, event.rowId);

        for (const sheetEvent of sheetEvents) {
            if (sheetEvent.origin === ChangeOrigin.SHEET) {
                const conflict = this.conflictResolver.detectConflict(sheetEvent, event);
                if (conflict) {
                    this.emit('conflict:detected', {
                        sheetEvent: conflict.sheetEvent,
                        mysqlEvent: conflict.mysqlEvent,
                    });

                    // Resolve immediately with configured strategy
                    const resolution = this.conflictResolver.resolve(conflict);
                    this.emit('conflict:resolved', {
                        winner: resolution.winner,
                        data: resolution.data,
                    });

                    // Remove conflicting events from queue
                    this.changeQueue.removeEventsForRow(event.tableName, event.rowId);

                    // Re-enqueue with resolved data if needed
                    if (resolution.winner === 'sheet') {
                        // Sheet wins, re-apply to MySQL
                        const resolvedEvent = createChangeEvent(
                            ChangeOrigin.SHEET,
                            'UPDATE',
                            event.tableName,
                            event.rowId,
                            resolution.data
                        );
                        this.changeQueue.enqueue(resolvedEvent, 1); // Higher priority
                    }
                    return;
                }
            }
        }

        // No conflict, add to queue
        this.changeQueue.enqueue(event);
        this.emitStatus();
    }

    /**
     * Start the processing loop
     */
    private startProcessingLoop(): void {
        const config = getConfig();

        this.syncInterval = setInterval(async () => {
            if (this.isSyncing || this.changeQueue.isEmpty()) {
                return;
            }

            await this.processQueue();
        }, 100); // Process every 100ms

        logger.debug('Processing loop started');
    }

    /**
     * Process pending changes in the queue
     */
    private async processQueue(): Promise<void> {
        const config = getConfig();
        const batch = this.changeQueue.dequeueBatch(config.sync.batchSize);

        if (batch.length === 0) {
            return;
        }

        this.isSyncing = true;
        this.emitStatus();

        const startTime = Date.now();
        let processed = 0;

        try {
            for (const event of batch) {
                await this.processEvent(event);
                processed++;
                this.emit('change:processed', event);
            }

            const duration = Date.now() - startTime;
            logger.debug('Batch processed', { processed, duration });
        } catch (error) {
            logger.error('Error processing queue', { error });
        } finally {
            this.isSyncing = false;
            this.emitStatus();
        }
    }

    /**
     * Process a single change event
     */
    private async processEvent(event: ChangeEvent): Promise<void> {
        try {
            if (event.origin === ChangeOrigin.SHEET) {
                await this.applyToMySQL(event);
            } else {
                await this.applyToSheets(event);
            }
        } catch (error) {
            logger.error('Failed to process event', {
                eventId: event.id,
                error,
            });
            throw error;
        }
    }

    /**
     * Apply Sheet change to MySQL
     */
    private async applyToMySQL(event: ChangeEvent): Promise<void> {
        const rowNumber = event.rowId as number;

        switch (event.operation) {
            case 'INSERT':
                const insertId = await this.mysqlClient.insertRow(
                    this.tableName,
                    { ...this.sanitizeData(event.data), _row_number: rowNumber },
                    'SHEET_TO_MYSQL'
                );

                // Fetch the fully created row (to get ID and any default values like status)
                const newRow = await this.mysqlClient.getRowById(this.tableName, insertId);

                if (newRow) {
                    // Update Sheet with the complete data from MySQL (ID, defaults, etc.)
                    // remove internal fields
                    const syncData: Record<string, unknown> = { ...newRow };
                    delete syncData._row_number;
                    delete syncData._sync_source;
                    delete syncData._sync_timestamp;
                    delete syncData._created_at;
                    delete syncData._updated_at;

                    // Write back to Sheet
                    await this.sheetsClient.updateRow(rowNumber, syncData, this.headers);
                    logger.info('Wrote back generated MySQL data (ID/defaults) to Sheet', { rowNumber, insertId });
                }
                break;

            case 'UPDATE':
                // Find the row by row_number
                const existing = await this.mysqlClient.query<Array<RowDataPacket & { id: number }>>(
                    `SELECT id FROM \`${this.tableName}\` WHERE _row_number = ?`,
                    [rowNumber]
                );

                if (existing.length > 0 && existing[0]) {
                    await this.mysqlClient.updateRow(
                        this.tableName,
                        existing[0].id,
                        this.sanitizeData(event.data),
                        'id',
                        'SHEET_TO_MYSQL'
                    );
                } else {
                    // Row doesn't exist, insert it
                    await this.mysqlClient.insertRow(
                        this.tableName,
                        { ...this.sanitizeData(event.data), _row_number: rowNumber },
                        'SHEET_TO_MYSQL'
                    );
                }
                break;

            case 'DELETE':
                await this.mysqlClient.execute(
                    `DELETE FROM \`${this.tableName}\` WHERE _row_number = ?`,
                    [rowNumber]
                );
                break;
        }

        logger.debug('Applied Sheet change to MySQL', {
            operation: event.operation,
            rowNumber,
        });
    }

    /**
     * Apply MySQL change to Sheets
     */
    private async applyToSheets(event: ChangeEvent): Promise<void> {
        const rowNumber = (event.data._row_number as number) ?? event.rowId;

        switch (event.operation) {
            case 'INSERT':
                // Append new row to Sheet
                const newRowNumber = await this.sheetsClient.appendRow(event.data, this.headers);

                // Update the row_number in MySQL for future reference
                if (typeof event.rowId === 'number') {
                    await this.mysqlClient.updateRow(
                        this.tableName,
                        event.rowId,
                        { _row_number: newRowNumber },
                        'id',
                        'MYSQL_TO_SHEET'
                    );
                }
                break;

            case 'UPDATE':
                if (typeof rowNumber === 'number' && rowNumber > 1) {
                    await this.sheetsClient.updateRow(rowNumber, event.data, this.headers);
                }
                break;

            case 'DELETE':
                if (typeof rowNumber === 'number' && rowNumber > 1) {
                    await this.sheetsClient.clearRow(rowNumber, this.headers.length);
                }
                break;
        }

        logger.debug('Applied MySQL change to Sheets', {
            operation: event.operation,
            rowNumber,
        });
    }

    /**
     * Map webhook operation type to our internal type
     */
    private mapOperationType(type: string): 'INSERT' | 'UPDATE' | 'DELETE' {
        switch (type.toUpperCase()) {
            case 'INSERT':
                return 'INSERT';
            case 'DELETE':
                return 'DELETE';
            default:
                return 'UPDATE';
        }
    }

    /**
     * Trigger a full sync manually
     */
    async triggerFullSync(): Promise<void> {
        logger.info('Manual full sync triggered');
        await this.performInitialSync();
    }

    /**
     * Emit current status to listeners
     */
    private emitStatus(): void {
        const status: SyncStatus = {
            isRunning: this.isRunning,
            lastSyncAt: Date.now(),
            pendingChanges: this.changeQueue.size(),
            unresolvedConflicts: this.conflictResolver.getPendingCount(),
        };

        if (this.isSyncing) {
            status.currentOperation = 'Syncing';
        }

        this.emit('status:update', status);
    }

    /**
     * Sanitize data before sending to MySQL
     */
    private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
        const clean = { ...data };
        if (clean.id === '' || clean.id === null) {
            delete clean.id;
        }
        return clean;
    }

    /**
     * Get current sync status
     */
    getStatus(): SyncStatus {
        const status: SyncStatus = {
            isRunning: this.isRunning,
            lastSyncAt: Date.now(),
            pendingChanges: this.changeQueue.size(),
            unresolvedConflicts: this.conflictResolver.getPendingCount(),
        };

        if (this.isSyncing) {
            status.currentOperation = 'Syncing';
        }

        return status;
    }

    /**
     * Stop the sync engine
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        logger.info('Stopping sync engine');

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        await this.cdcListener.stop();
        await this.mysqlClient.disconnect();

        this.isRunning = false;
        this.emitStatus();

        logger.info('Sync engine stopped');
    }
}

// Singleton instance
let syncEngineInstance: SyncEngine | null = null;

/**
 * Get the sync engine singleton
 */
export function getSyncEngine(): SyncEngine {
    if (!syncEngineInstance) {
        syncEngineInstance = new SyncEngine();
    }
    return syncEngineInstance;
}
