import mysql, { Pool } from 'mysql2/promise';

interface MySQLConfig {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
}

export class MySQLConnectionManager {
    private static pools: Map<string, Pool> = new Map();

    /**
     * Get or create a connection pool for a specific configuration
     * We use a cache key based on the config to reuse pools
     */
    static async getPool(config: MySQLConfig): Promise<Pool> {
        const key = `${config.host}:${config.port}:${config.user}:${config.database}`;

        if (this.pools.has(key)) {
            return this.pools.get(key)!;
        }

        const pool = mysql.createPool({
            ...config,
            waitForConnections: true,
            connectionLimit: 5, // Limit per tenant to avoid exhaustion
            queueLimit: 0,
            ssl: config.ssl ? { rejectUnauthorized: false } : undefined // Default to allowing self-signed for ease, or stricter
        });

        // Test connection
        try {
            const conn = await pool.getConnection();
            conn.release();
        } catch (error) {
            console.error('Failed to connect to MySQL:', error);
            throw error;
        }

        this.pools.set(key, pool);
        return pool;
    }

    /**
     * Close all pools (shutdown)
     */
    static async closeAll() {
        for (const pool of this.pools.values()) {
            await pool.end();
        }
        this.pools.clear();
    }
}
