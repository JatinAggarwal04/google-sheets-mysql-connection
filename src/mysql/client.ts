import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';

const logger = createComponentLogger('MySQLClient');

/**
 * MySQL client wrapper with connection pooling and lifecycle management
 */
export class MySQLClient {
    private pool: Pool | null = null;
    private isConnected = false;

    constructor(config?: {
        host?: string;
        user?: string;
        password?: string;
        database?: string;
        port?: number;
    }) {
        if (config) {
            this.config = config;
        } else {
            const globalConfig = getConfig();
            this.config = {
                host: globalConfig.mysql.host,
                user: globalConfig.mysql.user,
                password: globalConfig.mysql.password,
                database: globalConfig.mysql.database,
                port: globalConfig.mysql.port,
            };
        }
    }

    private config: {
        host?: string;
        user?: string;
        password?: string;
        database?: string;
        port?: number;
    };

    /**
     * Initialize the connection pool
     */
    async connect(): Promise<void> {
        if (this.pool) {
            // Check if existing pool matches new config?
            // For now, assume if pool exists, we are good.
            // In multi-tenant, we might create new instances of MySQLClient per connection.
            return;
        }

        try {
            this.pool = mysql.createPool({
                host: this.config.host || 'localhost',
                port: this.config.port || 3306,
                user: this.config.user || 'root',
                password: this.config.password || '',
                database: this.config.database || '',
                waitForConnections: true,
                connectionLimit: 10,
                maxIdle: 5,
                idleTimeout: 60000,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
            });

            // Test connection
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            this.isConnected = true;
            logger.info('MySQL connection pool initialized', {
                host: this.config.host,
                database: this.config.database,
            });
        } catch (error) {
            throw new DatabaseError('Failed to initialize MySQL connection pool', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: {
                    host: this.config.host,
                    database: this.config.database,
                },
            });
        }
    }

    /**
     * Get a connection from the pool
     */
    async getConnection(): Promise<PoolConnection> {
        if (!this.pool) {
            throw new DatabaseError('MySQL pool not initialized. Call connect() first.');
        }

        try {
            return await this.pool.getConnection();
        } catch (error) {
            throw new DatabaseError('Failed to get connection from pool', {
                cause: error instanceof Error ? error : new Error(String(error)),
            });
        }
    }

    /**
     * Execute a query with parameters (prepared statement)
     */
    async query<T extends RowDataPacket[]>(
        sql: string,
        params?: unknown[]
    ): Promise<T> {
        if (!this.pool) {
            throw new DatabaseError('MySQL pool not initialized. Call connect() first.');
        }

        const startTime = Date.now();

        try {
            const [rows] = await this.pool.execute<T>(sql, params);

            logger.debug('Query executed', {
                operation: 'query',
                duration: Date.now() - startTime,
                rowCount: rows.length,
            });

            return rows;
        } catch (error) {
            logger.error('Query failed', {
                operation: 'query',
                error,
                duration: Date.now() - startTime,
            });

            throw new DatabaseError('Query execution failed', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { sql: sql.substring(0, 100) }, // Truncate for logging
            });
        }
    }

    /**
     * Execute an insert/update/delete query
     */
    async execute(
        sql: string,
        params?: unknown[]
    ): Promise<ResultSetHeader> {
        if (!this.pool) {
            throw new DatabaseError('MySQL pool not initialized. Call connect() first.');
        }

        const startTime = Date.now();

        try {
            const [result] = await this.pool.execute<ResultSetHeader>(sql, params);

            logger.debug('Statement executed', {
                operation: 'execute',
                duration: Date.now() - startTime,
                affectedRows: result.affectedRows,
            });

            return result;
        } catch (error) {
            logger.error('Statement execution failed', {
                operation: 'execute',
                error,
                duration: Date.now() - startTime,
            });

            throw new DatabaseError('Statement execution failed', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { sql: sql.substring(0, 100) },
            });
        }
    }

    /**
     * Execute multiple statements in a transaction
     */
    async transaction<T>(
        callback: (connection: PoolConnection) => Promise<T>
    ): Promise<T> {
        const connection = await this.getConnection();

        try {
            await connection.beginTransaction();
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Insert a row and return the inserted ID
     */
    async insertRow(
        tableName: string,
        data: Record<string, unknown>,
        syncSource?: string
    ): Promise<number> {
        const columns = Object.keys(data);
        const values = Object.values(data);

        // Add sync source for loop prevention
        if (syncSource) {
            columns.push('_sync_source');
            values.push(syncSource);
            columns.push('_sync_timestamp');
            values.push(new Date());
        }

        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;

        const result = await this.execute(sql, values);
        return result.insertId;
    }

    /**
     * Update a row by ID
     */
    async updateRow(
        tableName: string,
        id: number | string,
        data: Record<string, unknown>,
        idColumn: string = 'id',
        syncSource?: string
    ): Promise<number> {
        const updates = Object.keys(data).map(col => `\`${col}\` = ?`);
        const values = Object.values(data);

        // Add sync metadata
        if (syncSource) {
            updates.push('`_sync_source` = ?');
            values.push(syncSource);
            updates.push('`_sync_timestamp` = ?');
            values.push(new Date());
        }

        values.push(id);

        const sql = `UPDATE \`${tableName}\` SET ${updates.join(', ')} WHERE \`${idColumn}\` = ?`;
        const result = await this.execute(sql, values);
        return result.affectedRows;
    }

    /**
     * Delete a row by ID
     */
    async deleteRow(
        tableName: string,
        id: number | string,
        idColumn: string = 'id'
    ): Promise<number> {
        const sql = `DELETE FROM \`${tableName}\` WHERE \`${idColumn}\` = ?`;
        const result = await this.execute(sql, [id]);
        return result.affectedRows;
    }

    /**
     * Get all rows from a table
     */
    async getAllRows<T extends RowDataPacket>(tableName: string): Promise<T[]> {
        const sql = `SELECT * FROM \`${tableName}\``;
        return this.query<T[]>(sql);
    }

    /**
     * Get a row by ID
     */
    async getRowById<T extends RowDataPacket>(
        tableName: string,
        id: number | string,
        idColumn: string = 'id'
    ): Promise<T | null> {
        const sql = `SELECT * FROM \`${tableName}\` WHERE \`${idColumn}\` = ?`;
        const rows = await this.query<T[]>(sql, [id]);
        return rows[0] ?? null;
    }

    /**
     * Check if connected
     */
    getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Get database name
     */
    getDatabaseName(): string {
        return this.config.database || getConfig().mysql.database;
    }

    /**
     * Gracefully close the pool
     */
    async disconnect(): Promise<void> {
        if (this.pool) {
            logger.info('Closing MySQL connection pool');
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
        }
    }
}

// Singleton instance
let mysqlClientInstance: MySQLClient | null = null;

/**
 * Get the MySQL client singleton
 */
export function getMySQLClient(config?: {
    host?: string;
    user?: string;
    password?: string;
    database?: string;
    port?: number;
}): MySQLClient {
    if (config) {
        return new MySQLClient(config);
    }
    if (!mysqlClientInstance) {
        mysqlClientInstance = new MySQLClient();
    }
    return mysqlClientInstance;
}
