// ===========================================
// MySQL Connection Service
// ===========================================

import mysql, { Pool, PoolConnection, RowDataPacket, FieldPacket } from 'mysql2/promise';
import { getSupabaseAdmin } from '../config/supabase.js';
import { encryptCredentials, decryptCredentials } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ExternalServiceError } from '../lib/errors.js';
import type { MySQLConnection } from '../types/database.js';
import type { CreateMySQLConnectionRequest } from '../types/api.js';

interface MySQLCredentials {
    username: string;
    password: string;
}

// Connection pool cache by connection ID
const poolCache = new Map<string, Pool>();

/**
 * Creates MySQL connection pool
 */
function createPool(
    host: string,
    port: number,
    database: string,
    credentials: MySQLCredentials
): Pool {
    return mysql.createPool({
        host,
        port,
        database,
        user: credentials.username,
        password: credentials.password,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
    });
}

/**
 * Gets or creates connection pool for a connection
 */
async function getPool(connectionId: string): Promise<Pool> {
    if (poolCache.has(connectionId)) {
        return poolCache.get(connectionId)!;
    }

    const supabase = getSupabaseAdmin();

    const { data: connection, error } = await supabase
        .from('mysql_connections')
        .select('*')
        .eq('id', connectionId)
        .single();

    if (error || !connection) {
        throw new NotFoundError('MySQL connection');
    }

    const credentials = decryptCredentials<MySQLCredentials>(connection.encrypted_credentials);

    const pool = createPool(
        connection.host,
        connection.port,
        connection.database,
        credentials
    );

    poolCache.set(connectionId, pool);

    return pool;
}

/**
 * Tests MySQL connection
 */
export async function testConnection(
    host: string,
    port: number,
    database: string,
    username: string,
    password: string
): Promise<boolean> {
    let connection: PoolConnection | null = null;

    try {
        const pool = createPool(host, port, database, { username, password });
        connection = await pool.getConnection();
        await connection.ping();
        await pool.end();
        return true;
    } catch (error) {
        logger.error('MySQL connection test failed:', error);
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

/**
 * Creates/saves MySQL connection
 */
export async function createMySQLConnection(
    tenantId: string,
    request: CreateMySQLConnectionRequest
): Promise<MySQLConnection> {
    // Test connection first
    const isValid = await testConnection(
        request.host,
        request.port,
        request.database,
        request.username,
        request.password
    );

    if (!isValid) {
        throw new ExternalServiceError('MySQL', 'Failed to connect with provided credentials');
    }

    const supabase = getSupabaseAdmin();

    const encryptedCredentials = encryptCredentials({
        username: request.username,
        password: request.password,
    });

    const { data, error } = await supabase
        .from('mysql_connections')
        .insert({
            tenant_id: tenantId,
            name: request.name,
            host: request.host,
            port: request.port,
            database: request.database,
            username: request.username,
            encrypted_credentials: encryptedCredentials,
            is_valid: true,
        })
        .select()
        .single();

    if (error) {
        logger.error('Failed to create MySQL connection:', error);
        throw new Error('Failed to save MySQL connection');
    }

    return data;
}

/**
 * Lists MySQL connections for tenant
 */
export async function listMySQLConnections(tenantId: string): Promise<MySQLConnection[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('mysql_connections')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_valid', true)
        .order('created_at', { ascending: false });

    if (error) {
        logger.error('Failed to list MySQL connections:', error);
        throw new Error('Failed to list MySQL connections');
    }

    return data || [];
}

/**
 * Gets MySQL connection
 */
export async function getMySQLConnection(
    tenantId: string,
    connectionId: string
): Promise<MySQLConnection> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('mysql_connections')
        .select('*')
        .eq('id', connectionId)
        .eq('tenant_id', tenantId)
        .single();

    if (error || !data) {
        throw new NotFoundError('MySQL connection');
    }

    return data;
}

/**
 * Deletes MySQL connection
 */
export async function deleteMySQLConnection(
    tenantId: string,
    connectionId: string
): Promise<void> {
    const supabase = getSupabaseAdmin();

    // Close pool if exists
    if (poolCache.has(connectionId)) {
        await poolCache.get(connectionId)!.end();
        poolCache.delete(connectionId);
    }

    const { error } = await supabase
        .from('mysql_connections')
        .delete()
        .eq('id', connectionId)
        .eq('tenant_id', tenantId);

    if (error) {
        logger.error('Failed to delete MySQL connection:', error);
        throw new Error('Failed to delete MySQL connection');
    }
}

/**
 * Lists tables in database
 */
export async function listTables(connectionId: string): Promise<string[]> {
    try {
        const pool = await getPool(connectionId);
        const [rows] = await pool.query<RowDataPacket[]>('SHOW TABLES');
        return rows.map((row) => Object.values(row)[0] as string);
    } catch (error) {
        logger.error('Failed to list tables:', error);
        throw new ExternalServiceError('MySQL', 'Failed to list tables');
    }
}

/**
 * Gets table schema
 */
export async function getTableSchema(
    connectionId: string,
    tableName: string
): Promise<Array<{ column: string; type: string; nullable: boolean; key: string }>> {
    try {
        const pool = await getPool(connectionId);
        const [rows] = await pool.query<RowDataPacket[]>(`DESCRIBE \`${tableName}\``);

        return rows.map((row) => ({
            column: row.Field,
            type: row.Type,
            nullable: row.Null === 'YES',
            key: row.Key,
        }));
    } catch (error) {
        logger.error('Failed to get table schema:', error);
        throw new ExternalServiceError('MySQL', 'Failed to get table schema');
    }
}

/**
 * Gets table data
 */
export async function getTableData(
    connectionId: string,
    tableName: string,
    limit: number = 10000
): Promise<Record<string, unknown>[]> {
    try {
        const pool = await getPool(connectionId);
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM \`${tableName}\` LIMIT ?`,
            [limit]
        );
        return rows;
    } catch (error) {
        logger.error('Failed to get table data:', error);
        throw new ExternalServiceError('MySQL', 'Failed to get table data');
    }
}

/**
 * Converts ISO 8601 datetime strings to MySQL DATETIME format
 */
function formatValueForMySQL(value: unknown): unknown {
    if (typeof value === 'string') {
        // Check if it's an ISO 8601 datetime string (e.g., 2026-01-28T18:30:00.000Z)
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        if (isoDateRegex.test(value)) {
            // Convert to MySQL format: YYYY-MM-DD HH:MM:SS
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                const year = date.getUTCFullYear();
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                const hours = String(date.getUTCHours()).padStart(2, '0');
                const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            }
        }
    }
    return value;
}

/**
 * Inserts rows into table
 */
export async function insertRows(
    connectionId: string,
    tableName: string,
    rows: Record<string, unknown>[]
): Promise<number> {
    if (rows.length === 0) return 0;

    try {
        const pool = await getPool(connectionId);
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const columnsList = columns.map((c) => `\`${c}\``).join(', ');
        const updateClause = columns.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');

        let insertedCount = 0;

        for (const row of rows) {
            const values = columns.map((c) => formatValueForMySQL(row[c]));
            await pool.query(
                `INSERT INTO \`${tableName}\` (${columnsList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`,
                values
            );
            insertedCount++;
        }

        return insertedCount;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to insert rows into ${tableName}:`, error);
        throw new ExternalServiceError('MySQL', `Failed to insert rows: ${errorMessage}`);
    }
}

/**
 * Updates rows in table
 */
export async function updateRows(
    connectionId: string,
    tableName: string,
    rows: Array<{ data: Record<string, unknown>; primaryKeyColumn: string; primaryKeyValue: unknown }>
): Promise<number> {
    if (rows.length === 0) return 0;

    try {
        const pool = await getPool(connectionId);
        let updatedCount = 0;

        for (const row of rows) {
            const columns = Object.keys(row.data).filter((c) => c !== row.primaryKeyColumn);
            const setClause = columns.map((c) => `\`${c}\` = ?`).join(', ');
            const values = [...columns.map((c) => formatValueForMySQL(row.data[c])), formatValueForMySQL(row.primaryKeyValue)];

            await pool.query(
                `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${row.primaryKeyColumn}\` = ?`,
                values
            );
            updatedCount++;
        }

        return updatedCount;
    } catch (error) {
        logger.error('Failed to update rows:', error);
        throw new ExternalServiceError('MySQL', 'Failed to update rows');
    }
}

/**
 * Deletes rows from table
 */
export async function deleteRows(
    connectionId: string,
    tableName: string,
    primaryKeyColumn: string,
    primaryKeyValues: unknown[]
): Promise<number> {
    if (primaryKeyValues.length === 0) return 0;

    try {
        const pool = await getPool(connectionId);
        const placeholders = primaryKeyValues.map(() => '?').join(', ');

        const [result] = await pool.query(
            `DELETE FROM \`${tableName}\` WHERE \`${primaryKeyColumn}\` IN (${placeholders})`,
            primaryKeyValues
        );

        return (result as mysql.ResultSetHeader).affectedRows;
    } catch (error) {
        logger.error('Failed to delete rows:', error);
        throw new ExternalServiceError('MySQL', 'Failed to delete rows');
    }
}

/**
 * Creates table if not exists
 */
export async function createTableIfNotExists(
    connectionId: string,
    tableName: string,
    columns: Array<{ name: string; type: string; isPrimaryKey?: boolean }>
): Promise<void> {
    try {
        const pool = await getPool(connectionId);

        const columnDefs = columns.map((col) => {
            let def = `\`${col.name}\` ${col.type}`;
            if (col.isPrimaryKey) {
                def += ' PRIMARY KEY';
            }
            return def;
        });

        await pool.query(
            `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${columnDefs.join(', ')})`
        );

        logger.info(`Created table ${tableName} if not exists`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to create table:', error);
        throw new ExternalServiceError('MySQL', `Failed to create table: ${errorMessage}`);
    }
}

/**
 * Closes all connection pools
 */
export async function closeAllPools(): Promise<void> {
    for (const [id, pool] of poolCache) {
        await pool.end();
        poolCache.delete(id);
    }
}
/**
 * Checks if a table is empty
 */
export async function isTableEmpty(
    connectionId: string,
    tableName: string
): Promise<boolean> {
    try {
        const pool = await getPool(connectionId);

        // Simple count check
        // Using mysql.escapeId for safety although exact implementation might vary
        // mysql2 pool.query automatically handles parameterized queries but table names 
        // often need identifier escaping which isn't standard parameterization.
        // We'll trust the input or use simple validation since it's an internal-ish tool.
        // Better: use ?? for identifier escaping in mysql2.

        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM ??',
            [tableName]
        );

        const count = rows[0]?.count;
        return count === 0;
    } catch (error) {
        logger.error('Failed to check if table is empty:', error);
        throw new ExternalServiceError('MySQL', 'Failed to check table status');
    }
}
