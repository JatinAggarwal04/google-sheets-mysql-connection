import { EventEmitter } from 'events';
import { getMySQLClient, MySQLClient } from './client.js';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { ChangeEvent, ChangeOrigin, createChangeEvent } from '../sync/change-event.js';
import { RowDataPacket } from 'mysql2/promise';

const logger = createComponentLogger('PollingListener');

/**
 * Polling Listener for MySQL changes
 * Used as a fallback when CDC (Binary Log) is unavailable.
 * Note: Mainly detects INSERT and UPDATE. DELETE is harder to detect via polling without soft deletes.
 */
export class MySQLPollingListener extends EventEmitter {
    private client: MySQLClient;
    private isRunning = false;
    private pollInterval: NodeJS.Timeout | null = null;
    private lastCheckTime: Date;
    private tableName: string;
    private intervalMs = 2000; // Poll every 2 seconds

    constructor() {
        super();
        this.client = getMySQLClient();
        const config = getConfig();
        this.tableName = config.sync.tableName;
        this.lastCheckTime = new Date();
    }

    /**
     * Start polling
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.lastCheckTime = new Date(); // Reset time to now to avoid processing old history

        logger.info('Starting MySQL polling listener', {
            intervalMs: this.intervalMs,
            tableName: this.tableName
        });

        this.pollInterval = setInterval(() => this.poll(), this.intervalMs);
    }

    /**
     * Stop polling
     */
    async stop(): Promise<void> {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.isRunning = false;
        logger.info('Stopped MySQL polling listener');
    }

    /**
     * Poll for changes
     */
    private async poll(): Promise<void> {
        try {
            // Check for new changes since last check
            // Filter out changes that came from the sync engine (to avoid loops)
            const sql = `
                SELECT * FROM \`${this.tableName}\`
                WHERE \`_updated_at\` > ? 
                AND (\`_sync_source\` IS NULL OR \`_sync_source\` != 'SHEET_TO_MYSQL')
                LIMIT 100
            `;

            const rows = await this.client.query<RowDataPacket[]>(sql, [this.lastCheckTime]);

            if (rows.length > 0) {
                logger.debug('Polled changes detected', { count: rows.length });

                // Update last check time
                // Use the latest timestamp from the rows to ensure we don't miss anything in the next tick
                // But add a small buffer or just use current time if we are sure we caught everything?
                // Safest is to use the max timestamp found, but we need to handle precision.
                // For simplicity, we update lastCheckTime to Date.now() AFTER processing, 
                // but that runs risk of missing items inserted during processing.
                // Better: Update lastCheckTime to the max _updated_at found.

                let maxTime = this.lastCheckTime.getTime();

                for (const row of rows) {
                    const updatedAt = new Date(row._updated_at).getTime();
                    if (updatedAt > maxTime) {
                        maxTime = updatedAt;
                    }

                    // Determine operation type
                    // In polling, everything looks like an UPDATE or INSERT.
                    // If created_at is close to updated_at, it's an INSERT. 
                    // Otherwise UPDATE.
                    const createdAt = new Date(row._created_at || 0).getTime();
                    const operation = (updatedAt - createdAt < 2000) ? 'INSERT' : 'UPDATE';

                    this.emitChange(row, operation);
                }

                this.lastCheckTime = new Date(maxTime);
            }
        } catch (error) {
            logger.error('Polling error', { error });
        }
    }

    /**
     * Emit a change event
     */
    private emitChange(row: any, operation: 'INSERT' | 'UPDATE'): void {
        // Remove internal columns
        const cleanData = { ...row };
        const rowId = row.id;

        delete cleanData._sync_source;
        delete cleanData._sync_timestamp;
        delete cleanData._row_number;
        delete cleanData._created_at;
        delete cleanData._updated_at;

        const event = createChangeEvent(
            ChangeOrigin.MYSQL,
            operation,
            this.tableName,
            rowId,
            cleanData
        );

        this.emit('change', event);
    }
}

// Singleton instance
let pollingListenerInstance: MySQLPollingListener | null = null;

export function getPollingListener(): MySQLPollingListener {
    if (!pollingListenerInstance) {
        pollingListenerInstance = new MySQLPollingListener();
    }
    return pollingListenerInstance;
}
