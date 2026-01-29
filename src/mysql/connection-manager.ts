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

    // --- IMPORT FROM FILE ---

    /**
     * Import a file (Excel/CSV), create MySQL table, and optional Google Sheet
     */
    async importFromFile(
        userId: string,
        fileParams: { buffer: Buffer; fileName: string; mimeType: string },
        config: { name: string; sheetName?: string }
    ): Promise<number> {
        // Dynamic import to keep startup fast
        const xlsx = await import('xlsx');

        // 1. Parse File
        const workbook = xlsx.read(fileParams.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        // Convert to array of arrays
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length === 0) {
            throw new Error('File is empty');
        }

        const headers = (rows[0] as string[]).map(h => String(h || '').trim()).filter(h => h.length > 0);

        if (headers.length === 0) {
            throw new Error('No headers found in file');
        }

        // 2. Prepare Data
        // Map Excel Types to MySQL Types (Simple inference)
        const dataRows = rows.slice(1) as any[][];
        const columnDefinitions = headers.map((header, index) => {
            // Sample first few rows to infer type
            let type: 'string' | 'number' | 'boolean' | 'date' = 'string';

            // Check first 5 rows
            for (let i = 0; i < Math.min(dataRows.length, 5); i++) {
                const val = dataRows[i][index];
                if (typeof val === 'number') type = 'number';
                else if (typeof val === 'boolean') type = 'boolean';
                else if (val instanceof Date) type = 'date';
            }

            return { name: header, type };
        });

        // 3. Create MySQL Table
        // Sanitize table name (remove extension, replace spaces)
        const tableName = `user_${userId}_${config.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

        await this.schemaManager.ensureTable(tableName, columnDefinitions);

        // 4. Populate MySQL Table (Batch insert)
        // Optimization: Chunk inserts
        const client = getMySQLClient();
        if (dataRows.length > 0) {
            const columns = headers.map(h => `\`${h}\``).join(', ');
            const placeholders = headers.map(() => '?').join(', ');
            const sql = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`;

            // Simple loop for now (optimize with bulk insert later if needed)
            for (const row of dataRows) {
                // Align row data with headers
                const values = headers.map((_, i) => row[i] ?? null);
                await client.execute(sql, values);
            }
        }

        // 5. Create/Sync Google Sheet
        const sheetsClient = await import('../sheets/client.js').then(m => m.getSheetsClient());
        // For this demo, we assume the user provides a blank Sheet ID or we rely on them to create one.
        // Creating a new Google Sheet requires Drive API scope which we might not have enabled yet.
        // Strategy: Require user to provide an empty Sheet ID for now, OR just return the MySQL table info 
        // allowing them to pair it later? 
        // Requirement said: "System should be able to upload... then mysql database should be created in sync"
        // Let's assume we create a logical connection but maybe prompt for Sheet ID in invalid state, 
        // OR we try to populate a provided sheet.
        // Let's create the connection in 'paused' state with a placeholder spreadsheetId if not provided.
        // However, better flow: The Import Wizard asks for a Sheet ID to *Push* to, OR we just sync to MySQL for now.

        // Workaround: We will require the user to input a Sheet ID in the wizard TO which we will push this data.

        // 5. Create Connection Record
        // We set status to 'paused' initially. The user must provide a target Sheet ID to sync TO.
        // Or if we have a service account, we could technically create one (but that's complex).
        // Let's Create the connection with a "PENDING_SHEET_ID" placeholder.
        // The Wizard Step 3 will ask "Where do you want to sync this to? Enter Sheet ID" 
        // and then we update the connection and push the data.

        const connectionId = await this.createConnection(userId, {
            name: config.name,
            spreadsheetId: 'PENDING_SHEET_ID', // Flag to ask user
            sheetName: config.sheetName || 'Sheet1',
            mysqlTableName: tableName,
            columnMapping: headers.reduce((acc, h) => ({ ...acc, [h]: h }), {}),
            status: 'paused'
        });

        // 6. Return ID so frontend can redirect to "Finish Setup"
        return connectionId;
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
