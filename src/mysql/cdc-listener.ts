import MySQLEvents from '@rodrigogs/mysql-events';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { ChangeEvent, ChangeOrigin, OperationType } from '../sync/change-event.js';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

const logger = createComponentLogger('CDCListener');

/**
 * CDC (Change Data Capture) Listener using MySQL binary logs
 * Captures INSERT, UPDATE, DELETE events in real-time
 */
export class CDCListener extends EventEmitter {
    private instance: MySQLEvents | null = null;
    private isRunning = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 1000;

    constructor() {
        super();
    }

    /**
     * Start listening to binary log events
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('CDC listener already running');
            return;
        }

        const config = getConfig();

        try {
            this.instance = new MySQLEvents(
                {
                    host: config.mysql.host,
                    port: config.mysql.port,
                    user: config.mysql.user,
                    password: config.mysql.password,
                },
                {
                    startAtEnd: true, // Start from current position, not history
                    excludedSchemas: {
                        mysql: true,
                        information_schema: true,
                        performance_schema: true,
                        sys: true,
                    },
                }
            );

            // Handle errors
            this.instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, (error: Error) => {
                logger.error('CDC connection error', { error });
                this.handleDisconnect();
            });

            this.instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, (error: Error) => {
                logger.error('CDC ZongJi error', { error });
            });

            // Start the instance
            await this.instance.start();
            this.isRunning = true;
            this.reconnectAttempts = 0;

            // Add trigger for the sync table
            await this.addTableTrigger(config.mysql.database, config.sync.tableName);

            logger.info('CDC listener started', {
                database: config.mysql.database,
                table: config.sync.tableName,
            });
        } catch (error) {
            throw new DatabaseError('Failed to start CDC listener', {
                cause: error instanceof Error ? error : new Error(String(error)),
            });
        }
    }

    /**
     * Add a trigger for a specific table
     */
    async addTableTrigger(database: string, tableName: string): Promise<void> {
        if (!this.instance) {
            throw new DatabaseError('CDC listener not started');
        }

        const trigger = `${database}.${tableName}`;

        this.instance.addTrigger({
            name: `${tableName}_trigger`,
            expression: trigger,
            statement: MySQLEvents.STATEMENTS.ALL,
            onEvent: (event: MySQLEvents.Event) => {
                this.handleEvent(event);
            },
        });

        logger.info('Added CDC trigger', { trigger });
    }

    /**
     * Handle a binary log event
     */
    private handleEvent(event: MySQLEvents.Event): void {
        try {
            // Skip events originating from our sync (loop prevention)
            const affectedRows = event.affectedRows ?? [];

            for (const row of affectedRows) {
                // Check if this change came from our sync process
                const afterData = row.after ?? row.before ?? {};
                const syncSource = afterData._sync_source;

                if (syncSource === 'SHEET_TO_MYSQL') {
                    logger.debug('Skipping CDC event from sheet sync (loop prevention)', {
                        table: event.table,
                        type: event.type,
                    });
                    continue;
                }

                const changeEvent = this.convertToChangeEvent(event, row);
                if (changeEvent) {
                    logger.info('CDC event captured', {
                        operation: changeEvent.operation,
                        rowId: changeEvent.rowId,
                        table: event.table,
                    });

                    this.emit('change', changeEvent);
                }
            }
        } catch (error) {
            logger.error('Error processing CDC event', { error, event });
        }
    }

    /**
     * Convert MySQL event to our ChangeEvent format
     */
    private convertToChangeEvent(
        event: MySQLEvents.Event,
        row: { before?: Record<string, unknown>; after?: Record<string, unknown> }
    ): ChangeEvent | null {
        const config = getConfig();

        let operation: OperationType;
        let data: Record<string, unknown>;
        let previousData: Record<string, unknown> | undefined;
        let rowId: string | number;

        switch (event.type) {
            case 'INSERT':
                operation = 'INSERT';
                data = row.after ?? {};
                rowId = (data.id as number) ?? (data._row_number as number) ?? 0;
                break;

            case 'UPDATE':
                operation = 'UPDATE';
                data = row.after ?? {};
                previousData = row.before;
                rowId = (data.id as number) ?? (data._row_number as number) ?? 0;
                break;

            case 'DELETE':
                operation = 'DELETE';
                data = row.before ?? {};
                rowId = (data.id as number) ?? (data._row_number as number) ?? 0;
                break;

            default:
                return null;
        }

        // Remove sync metadata columns from the data
        const cleanData = { ...data };
        delete cleanData._sync_source;
        delete cleanData._sync_timestamp;
        delete cleanData._row_number;

        const changeEvent: ChangeEvent = {
            id: uuidv4(),
            origin: ChangeOrigin.MYSQL,
            operation,
            tableName: event.table ?? config.sync.tableName,
            rowId,
            data: cleanData,
            timestamp: Date.now(),
            userId: 'mysql',
        };

        // Only add previousData if it exists
        if (previousData) {
            changeEvent.previousData = previousData;
        }

        return changeEvent;
    }

    /**
     * Handle disconnection with reconnection logic
     */
    private async handleDisconnect(): Promise<void> {
        this.isRunning = false;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached for CDC listener');
            this.emit('error', new DatabaseError('CDC listener failed to reconnect'));
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        logger.info('Attempting CDC listener reconnection', {
            attempt: this.reconnectAttempts,
            delayMs: delay,
        });

        await new Promise(resolve => setTimeout(resolve, delay));

        try {
            await this.stop();
            await this.start();
        } catch (error) {
            logger.error('CDC listener reconnection failed', { error });
            this.handleDisconnect();
        }
    }

    /**
     * Check if the listener is running
     */
    getIsRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Stop the CDC listener
     */
    async stop(): Promise<void> {
        if (this.instance) {
            logger.info('Stopping CDC listener');
            await this.instance.stop();
            this.instance = null;
            this.isRunning = false;
        }
    }
}

// Singleton instance
let cdcListenerInstance: CDCListener | null = null;

/**
 * Get the CDC listener singleton
 */
export function getCDCListener(): CDCListener {
    if (!cdcListenerInstance) {
        cdcListenerInstance = new CDCListener();
    }
    return cdcListenerInstance;
}
