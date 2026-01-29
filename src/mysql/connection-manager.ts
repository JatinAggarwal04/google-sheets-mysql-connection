import { getMySQLClient, MySQLClient } from './client.js';
import { createSchemaManager, SchemaManager } from './schema-manager.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { RowDataPacket } from 'mysql2/promise';

const logger = createComponentLogger('ConnectionManager');

export interface ConnectionConfig {
    id?: number;
    name: string;
    spreadsheetId: string;
    sheetName: string;
    mysqlTableName: string;
    columnMapping: Record<string, string>; // header -> type
    status: 'active' | 'paused' | 'error';
    createdAt?: Date;
    updatedAt?: Date;
}

export class ConnectionManager {
    private client: MySQLClient;
    private schemaManager: SchemaManager;
    private tableName = 'sync_connections';

    constructor() {
        this.client = getMySQLClient();
        // Schema manager for the metadata DB (same database for now)
        this.schemaManager = createSchemaManager(this.client.getDatabaseName() || 'sheets_sync');
    }

    /**
     * Initialize the connections table
     */
    async initialize(): Promise<void> {
        await this.schemaManager.ensureTable(this.tableName, [
            { name: 'name', type: 'string', nullable: false },
            { name: 'spreadsheet_id', type: 'string', nullable: false },
            { name: 'sheet_name', type: 'string', nullable: false, defaultValue: 'Sheet1' },
            { name: 'mysql_table_name', type: 'string', nullable: false },
            { name: 'column_mapping', type: 'json', nullable: false },
            { name: 'status', type: 'string', nullable: false, defaultValue: 'active' },
        ]);
        logger.info('Connection manager initialized');
    }

    /**
     * Create a new connection
     */
    async createConnection(config: Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
        const sql = `
            INSERT INTO \`${this.tableName}\` 
            (name, spreadsheet_id, sheet_name, mysql_table_name, column_mapping, status, _created_at, _updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const values = [
            config.name,
            config.spreadsheetId,
            config.sheetName,
            config.mysqlTableName,
            JSON.stringify(config.columnMapping),
            config.status
        ];

        const result = await this.client.execute(sql, values);
        return result.insertId;
    }

    /**
     * Get all connections
     */
    async getAllConnections(): Promise<ConnectionConfig[]> {
        const rows = await this.client.query<RowDataPacket[]>(`SELECT * FROM \`${this.tableName}\``);
        return rows.map(this.mapRowToConfig);
    }

    /**
     * Get active connections
     */
    async getActiveConnections(): Promise<ConnectionConfig[]> {
        const rows = await this.client.query<RowDataPacket[]>(
            `SELECT * FROM \`${this.tableName}\` WHERE status = 'active'`
        );
        return rows.map(this.mapRowToConfig);
    }

    /**
     * Get connection by ID
     */
    async getConnection(id: number): Promise<ConnectionConfig | null> {
        const rows = await this.client.query<RowDataPacket[]>(
            `SELECT * FROM \`${this.tableName}\` WHERE id = ?`,
            [id]
        );
        return rows[0] ? this.mapRowToConfig(rows[0]) : null;
    }

    /**
     * Update connection status
     */
    async updateStatus(id: number, status: 'active' | 'paused' | 'error'): Promise<void> {
        await this.client.execute(
            `UPDATE \`${this.tableName}\` SET status = ?, _updated_at = NOW() WHERE id = ?`,
            [status, id]
        );
    }

    /**
     * Delete connection
     */
    async deleteConnection(id: number): Promise<void> {
        await this.client.execute(
            `DELETE FROM \`${this.tableName}\` WHERE id = ?`,
            [id]
        );
    }

    /**
     * Map DB row to Config object
     */
    private mapRowToConfig(row: any): ConnectionConfig {
        return {
            id: row.id,
            name: row.name,
            spreadsheetId: row.spreadsheet_id,
            sheetName: row.sheet_name,
            mysqlTableName: row.mysql_table_name,
            columnMapping: typeof row.column_mapping === 'string'
                ? JSON.parse(row.column_mapping)
                : row.column_mapping,
            status: row.status,
            createdAt: row._created_at,
            updatedAt: row._updated_at
        };
    }
}

// Singleton
let instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
    if (!instance) {
        instance = new ConnectionManager();
    }
    return instance;
}
