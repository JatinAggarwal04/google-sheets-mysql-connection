import { getMySQLClient, MySQLClient } from './client.js';
import { createComponentLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { RowDataPacket } from 'mysql2/promise';

const logger = createComponentLogger('SchemaManager');

/**
 * Column definition for table creation
 */
export interface ColumnDefinition {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'text' | 'json';
    nullable?: boolean;
    defaultValue?: unknown;
}

/**
 * Map internal types to MySQL types
 */
const TYPE_MAPPING: Record<ColumnDefinition['type'], string> = {
    string: 'VARCHAR(255)',
    number: 'DOUBLE',
    boolean: 'TINYINT(1)',
    date: 'DATETIME',
    text: 'TEXT',
    json: 'JSON',
};

/**
 * MySQL table information from INFORMATION_SCHEMA
 */
interface ColumnInfo extends RowDataPacket {
    COLUMN_NAME: string;
    DATA_TYPE: string;
    IS_NULLABLE: string;
    COLUMN_DEFAULT: string | null;
}

/**
 * Schema Manager for dynamic table creation and migration
 */
export class SchemaManager {
    private client: MySQLClient;
    private database: string;

    constructor(database: string, client?: MySQLClient) {
        this.client = client ?? getMySQLClient();
        this.database = database;
    }

    /**
     * Check if a table exists
     */
    async tableExists(tableName: string): Promise<boolean> {
        const sql = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    `;

        const rows = await this.client.query<Array<RowDataPacket & { count: number }>>(sql, [
            this.database,
            tableName,
        ]);

        return (rows[0]?.count ?? 0) > 0;
    }

    /**
     * Get existing table columns
     */
    async getTableColumns(tableName: string): Promise<Map<string, ColumnInfo>> {
        const sql = `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;

        const rows = await this.client.query<ColumnInfo[]>(sql, [this.database, tableName]);
        const columns = new Map<string, ColumnInfo>();

        for (const row of rows) {
            columns.set(row.COLUMN_NAME, row);
        }

        return columns;
    }

    /**
     * Create a table from column definitions
     */
    async createTable(tableName: string, columns: ColumnDefinition[]): Promise<void> {
        if (await this.tableExists(tableName)) {
            logger.warn('Table already exists, skipping creation', { tableName });
            return;
        }

        const columnDefs: string[] = [
            // Primary key - auto-incrementing ID
            '`id` INT AUTO_INCREMENT PRIMARY KEY',
            // Row number from Google Sheets (for correlation)
            '`_row_number` INT',
        ];

        // Reserved column names that we manage internally
        const reservedColumns = new Set(['id', '_row_number', '_sync_source', '_sync_timestamp', '_created_at', '_updated_at']);

        // Add user-defined columns (skipping reserved ones)
        for (const col of columns) {
            // Skip if this is a reserved column name
            if (reservedColumns.has(col.name.toLowerCase())) {
                logger.debug('Skipping reserved column from Sheet', { columnName: col.name });
                continue;
            }

            const mysqlType = TYPE_MAPPING[col.type];
            const nullable = col.nullable !== false ? 'NULL' : 'NOT NULL';
            const defaultVal = col.defaultValue !== undefined
                ? `DEFAULT ${this.escapeDefault(col.defaultValue)}`
                : '';

            columnDefs.push(`\`${col.name}\` ${mysqlType} ${nullable} ${defaultVal}`.trim());
        }

        // Add sync metadata columns for loop prevention
        columnDefs.push('`_sync_source` VARCHAR(50) NULL');
        columnDefs.push('`_sync_timestamp` DATETIME NULL');
        columnDefs.push('`_created_at` DATETIME DEFAULT CURRENT_TIMESTAMP');
        columnDefs.push('`_updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

        // Add index on row number for efficient lookups
        columnDefs.push('INDEX `idx_row_number` (`_row_number`)');
        // Add index on sync timestamp for querying recent changes
        columnDefs.push('INDEX `idx_sync_timestamp` (`_sync_timestamp`)');

        const sql = `CREATE TABLE \`${tableName}\` (\n  ${columnDefs.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

        try {
            await this.client.execute(sql, []);
            logger.info('Table created', { tableName, columnCount: columns.length });
        } catch (error) {
            throw new DatabaseError(`Failed to create table ${tableName}`, {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { tableName },
            });
        }
    }

    /**
     * Add missing columns to an existing table (migration)
     */
    async migrateTable(tableName: string, columns: ColumnDefinition[]): Promise<void> {
        const existingColumns = await this.getTableColumns(tableName);
        const newColumns: ColumnDefinition[] = [];

        for (const col of columns) {
            if (!existingColumns.has(col.name)) {
                newColumns.push(col);
            }
        }

        if (newColumns.length === 0) {
            logger.debug('No schema changes needed', { tableName });
            return;
        }

        // Add new columns
        for (const col of newColumns) {
            const mysqlType = TYPE_MAPPING[col.type];
            const nullable = col.nullable !== false ? 'NULL' : 'NOT NULL';

            const sql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col.name}\` ${mysqlType} ${nullable}`;

            try {
                await this.client.execute(sql, []);
                logger.info('Column added', { tableName, columnName: col.name });
            } catch (error) {
                throw new DatabaseError(`Failed to add column ${col.name} to ${tableName}`, {
                    cause: error instanceof Error ? error : new Error(String(error)),
                    context: { tableName, columnName: col.name },
                });
            }
        }
    }

    /**
     * Ensure table exists with the given schema, creating or migrating as needed
     */
    async ensureTable(tableName: string, columns: ColumnDefinition[]): Promise<void> {
        const exists = await this.tableExists(tableName);

        if (!exists) {
            await this.createTable(tableName, columns);
        } else {
            await this.migrateTable(tableName, columns);
        }
    }

    /**
     * Drop a table (use with caution!)
     */
    async dropTable(tableName: string): Promise<void> {
        const sql = `DROP TABLE IF EXISTS \`${tableName}\``;
        await this.client.execute(sql, []);
        logger.warn('Table dropped', { tableName });
    }

    /**
     * Escape default values for SQL
     */
    private escapeDefault(value: unknown): string {
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (typeof value === 'number') return String(value);
        return 'NULL';
    }
}

// Factory function
export function createSchemaManager(database: string): SchemaManager {
    return new SchemaManager(database);
}
