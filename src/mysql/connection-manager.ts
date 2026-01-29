import { getMySQLClient, MySQLClient } from './client.js';
import { createSchemaManager, SchemaManager } from './schema-manager.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { RowDataPacket } from 'mysql2/promise';

const logger = createComponentLogger('ConnectionManager');

export interface ConnectionConfig {
    id?: number;
    userId: string;
    name: string;
    spreadsheetId: string;
    sheetName: string;
    mysqlTableName: string;
    columnMapping: Record<string, string>; // header -> type
    status: 'active' | 'paused' | 'error';
    googleSecretId?: number;
    mysqlSecretId?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

export class ConnectionManager {
    private client: MySQLClient;
    private schemaManager: SchemaManager;
    private tableName = 'sync_connections';
    private secretsTableName = 'user_secrets';

    constructor() {
        this.client = getMySQLClient();
        // Schema manager for the metadata DB (same database for now)
        this.schemaManager = createSchemaManager(this.client.getDatabaseName() || 'sheets_sync');
    }

    /**
     * Initialize the connections and secrets tables
     */
    async initialize(): Promise<void> {
        // Connections table
        await this.schemaManager.ensureTable(this.tableName, [
            { name: 'user_id', type: 'string', nullable: false, defaultValue: 'system' }, // Default for migration
            { name: 'name', type: 'string', nullable: false },
            { name: 'spreadsheet_id', type: 'string', nullable: false },
            { name: 'sheet_name', type: 'string', nullable: false, defaultValue: 'Sheet1' },
            { name: 'mysql_table_name', type: 'string', nullable: false },
            { name: 'column_mapping', type: 'json', nullable: false },
            { name: 'status', type: 'string', nullable: false, defaultValue: 'active' },
            { name: 'google_secret_id', type: 'number', nullable: true },
            { name: 'mysql_secret_id', type: 'number', nullable: true },
        ]);

        // Secrets table
        await this.schemaManager.ensureTable(this.secretsTableName, [
            { name: 'user_id', type: 'string', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'type', type: 'string', nullable: false }, // 'google_sa' | 'mysql_creds'
            { name: 'encrypted_data', type: 'text', nullable: false },
            { name: 'iv', type: 'string', nullable: false },
        ]);

        logger.info('Connection manager initialized');
    }

    /**
     * Create a new connection
     */
    async createConnection(userId: string, config: Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<number> {
        const sql = `
            INSERT INTO \`${this.tableName}\` 
            (user_id, name, spreadsheet_id, sheet_name, mysql_table_name, column_mapping, status, google_secret_id, mysql_secret_id, _created_at, _updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const values = [
            userId,
            config.name,
            config.spreadsheetId,
            config.sheetName,
            config.mysqlTableName,
            JSON.stringify(config.columnMapping),
            config.status,
            config.googleSecretId || null,
            config.mysqlSecretId || null
        ];

        const result = await this.client.execute(sql, values);
        return result.insertId;
    }

    /**
     * Get all connections for a user
     */
    async getAllConnections(userId?: string): Promise<ConnectionConfig[]> {
        // Allow 'system' user or specific user
        const sql = userId
            ? `SELECT * FROM \`${this.tableName}\` WHERE user_id = ? OR user_id = 'system'`
            : `SELECT * FROM \`${this.tableName}\``;

        const params = userId ? [userId] : [];
        const rows = await this.client.query<RowDataPacket[]>(sql, params);
        return rows.map(this.mapRowToConfig);
    }



    /**
     * Get active connections (internal use, all users)
     */
    async getActiveConnections(): Promise<ConnectionConfig[]> {
        const rows = await this.client.query<RowDataPacket[]>(
            `SELECT * FROM \`${this.tableName}\` WHERE status = 'active'`
        );
        return rows.map(this.mapRowToConfig);
    }

    /**
     * Get connection by ID (secure check for ownership)
     */
    async getConnection(userId: string, id: number): Promise<ConnectionConfig | null> {
        const sql = `SELECT * FROM \`${this.tableName}\` WHERE id = ? AND (user_id = ? OR user_id = 'system')`;
        const rows = await this.client.query<RowDataPacket[]>(
            sql,
            [id, userId]
        );
        return rows[0] ? this.mapRowToConfig(rows[0]) : null;
    }

    // Internal use (Coordinator)
    async getConnectionInternal(id: number): Promise<ConnectionConfig | null> {
        const sql = `SELECT * FROM \`${this.tableName}\` WHERE id = ?`;
        const rows = await this.client.query<RowDataPacket[]>(
            sql,
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
    async deleteConnection(userId: string, id: number): Promise<void> {
        await this.client.execute(
            `DELETE FROM \`${this.tableName}\` WHERE id = ? AND user_id = ?`,
            [id, userId]
        );
    }

    // --- SECRETS MANAGEMENT ---

    /**
     * Create a new encrypted secret
     */
    async createSecret(userId: string, name: string, type: 'google_sa' | 'mysql_creds', value: string): Promise<number> {
        // Dynamic import to avoid circular dep if any (though utils should be fine)
        const { encrypt } = await import('../utils/crypto.js');
        const encrypted = encrypt(value);
        // encrypted string is "iv:authTag:content"
        const iv = encrypted.split(':')[0];

        const sql = `
            INSERT INTO \`${this.secretsTableName}\`
            (user_id, name, type, encrypted_data, iv, _created_at, _updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const result = await this.client.execute(sql, [userId, name, type, encrypted, iv]);
        return result.insertId;
    }

    /**
     * Get all secrets for a user (metadata only)
     */
    async getSecrets(userId: string): Promise<Array<{ id: number; name: string; type: string; createdAt: Date }>> {
        const sql = `SELECT id, name, type, _created_at FROM \`${this.secretsTableName}\` WHERE user_id = ?`;
        const rows = await this.client.query<RowDataPacket[]>(sql, [userId]);
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            createdAt: r._created_at
        }));
    }

    /**
     * Delete a secret
     */
    async deleteSecret(userId: string, id: number): Promise<void> {
        await this.client.execute(
            `DELETE FROM \`${this.secretsTableName}\` WHERE id = ? AND user_id = ?`,
            [id, userId]
        );
    }

    /**
     * Get decrypted secret value (Internal use mainly)
     */
    async getSecretValue(userId: string, id: number): Promise<string | null> {
        const { decrypt } = await import('../utils/crypto.js');
        const sql = `SELECT encrypted_data FROM \`${this.secretsTableName}\` WHERE id = ? AND user_id = ?`;
        const rows = await this.client.query<RowDataPacket[]>(sql, [id, userId]);

        if (!rows.length || !rows[0]) return null;
        return decrypt(rows[0].encrypted_data);
    }

    /**
     * Map DB row to Config object
     */
    private mapRowToConfig(row: any): ConnectionConfig {
        return {
            id: row.id,
            userId: row.user_id,
            name: row.name,
            spreadsheetId: row.spreadsheet_id,
            sheetName: row.sheet_name,
            mysqlTableName: row.mysql_table_name,
            columnMapping: typeof row.column_mapping === 'string'
                ? JSON.parse(row.column_mapping)
                : row.column_mapping,
            status: row.status,
            googleSecretId: row.google_secret_id,
            mysqlSecretId: row.mysql_secret_id,
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
