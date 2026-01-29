import { getMySQLClient, MySQLClient } from './client.js';
import { createSchemaManager, SchemaManager, ColumnDefinition } from './schema-manager.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { RowDataPacket } from 'mysql2/promise';
import { getSupabaseClient } from '../utils/supabase.js';
import { getConfig } from '../config/index.js';

const logger = createComponentLogger('ConnectionManager');

export interface ConnectionConfig {
    id?: string;
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
        const config = getConfig();
        this.schemaManager = createSchemaManager(config.mysql.database);
    }

    /**
     * Initialize manager (required by Coordinator)
     */
    async initialize(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Get all active connections for all users (System usage)
     */
    async getActiveConnections(): Promise<ConnectionConfig[]> {
        const supabase = getSupabaseClient();

        // Cast to any to bypass strict type checking without generated types
        const { data, error } = await (supabase
            .from('user_integrations') as any)
            .select('*')
            .eq('status', 'active');

        if (error) {
            logger.error('Failed to fetch active connections', { error });
            throw new DatabaseError('Failed to fetch active connections');
        }

        return (data as any[]).map(this.mapSupabaseToConfig);
    }

    /**
     * Create a new connection
     */
    async createConnection(userId: string, config: Omit<ConnectionConfig, 'id' | 'userId'>): Promise<string> {
        const connection = await this.client.getConnection();
        const supabase = getSupabaseClient();

        try {
            await connection.beginTransaction();

            // Create destination table
            const columnDefs = this.mapToColumnDefs(config.columnMapping);
            await this.schemaManager.ensureTable(config.mysqlTableName, columnDefs);

            // Insert into Supabase
            const { data, error } = await (supabase
                .from('user_integrations') as any)
                .insert({
                    user_id: userId,
                    connection_name: config.name,
                    spreadsheet_id: config.spreadsheetId,
                    sheet_name: config.sheetName,
                    mysql_table_name: config.mysqlTableName,
                    column_mapping: config.columnMapping,
                    status: config.status || 'active',
                })
                .select()
                .single();

            if (error) {
                throw new Error(`Supabase insert failed: ${error.message}`);
            }

            await connection.commit();
            const newId = (data as any).id;
            logger.info('Connection created', { id: newId, userId });
            return newId;

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

        const { data, error } = await (supabase
            .from('user_integrations') as any)
            .select('*')
            .eq('user_id', userId);

        if (error) {
            logger.error('Failed to fetch connections', { error });
            throw new DatabaseError('Failed to fetch connections');
        }

        return (data as any[]).map(this.mapSupabaseToConfig);
    }

    /**
     * Get a specific connection
     */
    async getConnection(userId: string, connectionId: string): Promise<ConnectionConfig | null> {
        const supabase = getSupabaseClient();

        const { data, error } = await (supabase
            .from('user_integrations') as any)
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
     * Get a specific connection by ID (Internal use, bypass user check)
     */
    async getConnectionInternal(connectionId: string): Promise<ConnectionConfig | null> {
        const supabase = getSupabaseClient();

        const { data, error } = await (supabase
            .from('user_integrations') as any)
            .select('*')
            .eq('id', connectionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            logger.error('Failed to fetch connection internal', { error });
            throw new DatabaseError('Failed to fetch connection internal');
        }

        return this.mapSupabaseToConfig(data);
    }

    /**
     * Delete a connection
     */
    async deleteConnection(userId: string, connectionId: string): Promise<void> {
        const supabase = getSupabaseClient();

        const conn = await this.getConnection(userId, connectionId);
        if (!conn) return;

        const { error } = await (supabase
            .from('user_integrations') as any)
            .delete()
            .eq('id', connectionId)
            .eq('user_id', userId);

        if (error) {
            logger.error('Failed to delete connection', { error });
            throw new DatabaseError('Failed to delete connection');
        }

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

        const { error } = await (supabase
            .from('user_integrations') as any)
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
            columnMapping: row.column_mapping || {},
            status: row.status,
            googleSecretId: row.google_secret_id,
            mysqlSecretId: row.mysql_secret_id,
            lastSync: row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }

    /**
     * Map record to ColumnDefinition[]
     */
    private mapToColumnDefs(mapping: Record<string, string>): ColumnDefinition[] {
        return Object.entries(mapping).map(([name, type]) => ({
            name,
            type: type as any, // Expect valid type from input
            nullable: true
        }));
    }

    /**
     * Get secrets (Legacy/MySQL support)
     */
    async getSecrets(secretId: number): Promise<any> {
        try {
            const [rows] = (await this.client.execute(
                'SELECT * FROM user_secrets WHERE id = ?',
                [secretId]
            )) as any; // Cast to bypass strict tuple type check
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
