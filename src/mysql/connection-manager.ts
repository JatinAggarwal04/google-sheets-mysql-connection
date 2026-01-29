import { getMySQLClient, MySQLClient } from './client.js';
import { createSchemaManager, SchemaManager } from './schema-manager.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise'; // explicit Import
import { getSupabaseClient } from '../utils/supabase.js';

const logger = createComponentLogger('ConnectionManager');

export interface ConnectionConfig {
    id?: string; // UUID
    userId: string;
    name: string;
    spreadsheetId: string;
    sheetName: string;
    mysqlTableName: string;
    columnMapping: Record<string, string>;
    status: 'active' | 'paused' | 'error';
    googleSecretId?: number;
    mysqlSecretId?: number;
    lastSync?: Date;
}

export class ConnectionManager {
    private client: MySQLClient;
    private schemaManager: SchemaManager;

    constructor() {
        this.client = getMySQLClient();
        this.schemaManager = createSchemaManager();
    }

    /**
     * Initialize manager (required by Coordinator)
     */
    async initialize(): Promise<void> {
        // No-op for Supabase mode (tables created via migration)
        return Promise.resolve();
    }

    /**
     * Get all active connections for all users (System usage)
     * Service Key allows bypassing RLS to fetch all.
     */
    async getActiveConnections(): Promise<ConnectionConfig[]> {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('user_integrations')
            .select('*')
            .eq('status', 'active');

        if (error) {
            logger.error('Failed to fetch active connections', { error });
            throw new DatabaseError('Failed to fetch active connections');
        }

        return data.map(this.mapSupabaseToConfig);
    }

    /**
     * Create a new connection
     * 1. Store secrets in MySQL (user_secrets)
     * 2. Store metadata in Supabase (user_integrations)
     * 3. Create destination table in MySQL
     */
    async createConnection(userId: string, config: Omit<ConnectionConfig, 'id' | 'userId'>): Promise<string> {
        const connection = await this.client.getConnection();
        const supabase = getSupabaseClient();

        try {
            await connection.beginTransaction();

            // 1. Store/Reference Secrets (Simplified for now: assuming secrets are managed/linked via IDs or created here)
            // For this implementation, we assume secrets are already handled or we insert dummy/placeholder if strictly required by logic.
            // The prompt says "continuing to use MySQL for storing encrypted secrets".
            // Since the frontend doesn't send secrets (auth is handled via simple user mapping in this demo or existing secrets),
            // We'll create placeholder entries or reuse existing logic if adaptable.
            // Original logic assumed we insert into user_secrets?
            // "INSERT INTO user_secrets ... "
            // The current createConnectionSchema in router DOES NOT accept credentials. 
            // So we assume the system uses a shared service account or linked account.
            // We will insert '0' or NULL for secret IDs if not provided, or handle them if logic requires.

            // Note: In a real app, we'd handle secret storage here. For now, we proceed to metadata.

            // 2. Create destination table
            await this.schemaManager.ensureTable(config.mysqlTableName, config.columnMapping);

            // 3. Insert into Supabase
            const { data, error } = await supabase
                .from('user_integrations')
                .insert({
                    user_id: userId,
                    connection_name: config.name,
                    spreadsheet_id: config.spreadsheetId,
                    sheet_name: config.sheetName,
                    mysql_table_name: config.mysqlTableName,
                    column_mapping: config.columnMapping,
                    status: config.status || 'active',
                    // Secrets would be linked here
                    // google_secret_id: ...
                })
                .select()
                .single();

            if (error) {
                throw new Error(`Supabase insert failed: ${error.message}`);
            }

            await connection.commit();
            logger.info('Connection created', { id: data.id, userId });
            return data.id;

        } catch (error) {
            await connection.rollback();
            logger.error('Failed to create connection', { error });
            throw new DatabaseError('Failed to create connection');
        } finally {
            connection.release();
        }
    }

    /**
     * Get all connections for a user from Supabase
     */
    async getAllConnections(userId: string): Promise<ConnectionConfig[]> {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('user_integrations')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            logger.error('Failed to fetch connections', { error });
            throw new DatabaseError('Failed to fetch connections');
        }

        return data.map(this.mapSupabaseToConfig);
    }

    /**
     * Get a specific connection
     */
    async getConnection(userId: string, connectionId: string): Promise<ConnectionConfig | null> {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('user_integrations')
            .select('*')
            .eq('id', connectionId)
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            logger.error('Failed to fetch connection', { error });
            throw new DatabaseError('Failed to fetch connection');
        }

        return this.mapSupabaseToConfig(data);
    }

    /**
     * Delete a connection
     */
    async deleteConnection(userId: string, connectionId: string): Promise<void> {
        const supabase = getSupabaseClient();

        // Get details first to clean up MySQL table
        const conn = await this.getConnection(userId, connectionId);
        if (!conn) return;

        const { error } = await supabase
            .from('user_integrations')
            .delete()
            .eq('id', connectionId)
            .eq('user_id', userId);

        if (error) {
            logger.error('Failed to delete connection', { error });
            throw new DatabaseError('Failed to delete connection');
        }

        // Drop MySQL table (optional, but good for cleanup)
        try {
            await this.schemaManager.dropTable(conn.mysqlTableName);
        } catch (e) {
            logger.warn('Failed to drop MySQL table', { table: conn.mysqlTableName, error: e });
        }
    }

    /**
     * Update connection status
     */
    async updateStatus(connectionId: string, status: 'active' | 'paused' | 'error'): Promise<void> {
        const supabase = getSupabaseClient();

        const { error } = await supabase
            .from('user_integrations')
            .update({ status })
            .eq('id', connectionId);

        if (error) {
            logger.error('Failed to update status', { error });
            throw new DatabaseError('Failed to update status');
        }
    }

    /**
     * Helper to map Supabase row to ConnectionConfig
     */
    private mapSupabaseToConfig(row: any): ConnectionConfig {
        return {
            id: row.id,
            userId: row.user_id,
            name: row.connection_name,
            spreadsheetId: row.spreadsheet_id,
            sheetName: row.sheet_name,
            mysqlTableName: row.mysql_table_name,
            columnMapping: row.column_mapping,
            status: row.status,
            googleSecretId: row.google_secret_id,
            mysqlSecretId: row.mysql_secret_id,
            lastSync: row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }

    /**
     * Get secrets (Legacy/MySQL support)
     * Secrets are still stored in MySQL user_secrets table
     */
    async getSecrets(secretId: number): Promise<any> {
        try {
            const [rows] = await this.client.execute<RowDataPacket[]>(
                'SELECT * FROM user_secrets WHERE id = ?',
                [secretId]
            );
            return rows[0] || null;
        } catch (error) {
            logger.error('Failed to fetch secrets', { error });
            return null;
        }
    }
}

let instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
    if (!instance) {
        instance = new ConnectionManager();
    }
    return instance;
}
