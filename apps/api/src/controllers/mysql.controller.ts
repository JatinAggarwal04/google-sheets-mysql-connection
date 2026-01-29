import { Request, Response } from 'express';
import { MySQLConnectionManager } from '../services/mysql-connection.service.js';

export const validateConnection = async (req: Request, res: Response) => {
    const config = req.body; // { host, user, password, database, port }

    // Basic validation
    if (!config.host || !config.user || !config.database) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const pool = await MySQLConnectionManager.getPool(config);
        // Pools are cached, but if config is wrong, getPool might not throw until we try to use it?
        // Actually, getPool does a test connection.
        res.json({ success: true, message: 'Connection successful' });
    } catch (error) {
        console.error('MySQL validation error:', error);
        res.status(400).json({ error: 'Connection failed', details: (error as any).message });
    }
};

export const listTables = async (req: Request, res: Response) => {
    const config = req.body;

    try {
        const pool = await MySQLConnectionManager.getPool(config);
        const [rows] = await pool.query('SHOW TABLES');
        // Rows is typically [{ "Tables_in_dbname": "tablename" }]
        const tables = (rows as any[]).map(r => Object.values(r)[0]);
        res.json({ tables });
    } catch (error) {
        console.error('List tables error:', error);
        res.status(500).json({ error: 'Failed to list tables' });
    }
};

export const getTableColumns = async (req: Request, res: Response) => {
    const { config, table } = req.body;

    if (!table) return res.status(400).json({ error: 'Table name required' });

    try {
        const pool = await MySQLConnectionManager.getPool(config);
        const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
        // Rows: Field, Type, Null, Key, Default, Extra
        res.json({ columns: rows });
    } catch (error) {
        console.error('List columns error:', error);
        res.status(500).json({ error: 'Failed to get columns' });
    }
};
