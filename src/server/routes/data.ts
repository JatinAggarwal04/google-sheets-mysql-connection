import { Router, Request, Response } from 'express';
import { getConfig } from '../../config/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getMySQLClient } from '../../mysql/client.js';
import { getSheetsClient } from '../../sheets/client.js';
import { RowDataPacket } from 'mysql2/promise';
import { getCoordinator } from '../../sync/coordinator.js';

const logger = createComponentLogger('DataRoute');

export const dataRouter = Router();

/**
 * GET /api/data/sheets
 * Fetch all data from Google Sheet
 */
dataRouter.get('/sheets', async (req: Request, res: Response) => {
    try {
        const sheetsClient = getSheetsClient();
        const sheetData = await sheetsClient.getSheetData();

        // Convert to row objects with row numbers
        const rows = sheetData.rows.map(r => ({ _rowNumber: r.rowNumber, ...r.data }));

        res.json({
            source: 'sheets',
            headers: ['_rowNumber', ...sheetData.headers],
            rows,
            count: rows.length,
            spreadsheetId: getConfig().sheets.spreadsheetId,
            sheetName: getConfig().sheets.sheetName,
        });
    } catch (error) {
        logger.error('Error fetching Sheet data', { error });
        res.status(500).json({
            error: {
                code: 'SHEETS_FETCH_ERROR',
                message: 'Failed to fetch Google Sheets data',
            },
        });
    }
});

/**
 * GET /api/data/mysql
 * Fetch all data from MySQL
 */
dataRouter.get('/mysql', async (req: Request, res: Response) => {
    try {
        const config = getConfig();
        const mysqlClient = getMySQLClient();
        const tableName = config.sync.tableName;

        const sql = `SELECT * FROM \`${tableName}\` ORDER BY id ASC`;
        const rows = await mysqlClient.query<RowDataPacket[]>(sql, []);

        // Get column names from first row or empty
        const firstRow = rows[0];
        const headers = firstRow ? Object.keys(firstRow) : [];

        res.json({
            source: 'mysql',
            headers,
            rows,
            count: rows.length,
            database: config.mysql.database,
            table: tableName,
        });
    } catch (error) {
        logger.error('Error fetching MySQL data', { error });
        res.status(500).json({
            error: {
                code: 'MYSQL_FETCH_ERROR',
                message: 'Failed to fetch MySQL data',
            },
        });
    }
});

/**
 * PUT /api/data/sheets/:row
 * Update a row in Google Sheet
 */
dataRouter.put('/sheets/:row', async (req: Request, res: Response) => {
    try {
        const rowParam = req.params['row'];
        if (!rowParam) {
            res.status(400).json({
                error: {
                    code: 'MISSING_ROW',
                    message: 'Row parameter is required',
                },
            });
            return;
        }

        const rowNumber = parseInt(rowParam, 10);
        const data = req.body as Record<string, unknown>;

        if (isNaN(rowNumber) || rowNumber < 2) {
            res.status(400).json({
                error: {
                    code: 'INVALID_ROW',
                    message: 'Row number must be 2 or greater (row 1 is headers)',
                },
            });
            return;
        }

        const sheetsClient = getSheetsClient();
        await sheetsClient.updateRowAuto(rowNumber, data);

        logger.info('Sheet row updated via API', { rowNumber });

        // Notify Sync Engine
        const engine = getCoordinator().getDefaultEngine();
        if (engine) {
            engine.handleSheetChange({
                row: rowNumber,
                column: 0,
                operationType: 'UPDATE',
                rowData: data,
                editedBy: 'DASHBOARD_API'
            });
        } else {
            logger.warn('No sync engine active to notify of sheet update');
        }

        res.json({
            success: true,
            message: `Row ${rowNumber} updated`,
            source: 'sheets',
        });
    } catch (error) {
        logger.error('Error updating Sheet row', { error });
        res.status(500).json({
            error: {
                code: 'SHEETS_UPDATE_ERROR',
                message: 'Failed to update Google Sheets row',
            },
        });
    }
});

/**
 * PUT /api/data/mysql/:id
 * Update a row in MySQL
 */
dataRouter.put('/mysql/:id', async (req: Request, res: Response) => {
    try {
        const idParam = req.params['id'];
        if (!idParam) {
            res.status(400).json({
                error: {
                    code: 'MISSING_ID',
                    message: 'ID parameter is required',
                },
            });
            return;
        }

        const id = parseInt(idParam, 10);
        const data = req.body as Record<string, unknown>;

        if (isNaN(id) || id < 1) {
            res.status(400).json({
                error: {
                    code: 'INVALID_ID',
                    message: 'ID must be a positive integer',
                },
            });
            return;
        }

        const config = getConfig();
        const mysqlClient = getMySQLClient();
        const tableName = config.sync.tableName;

        // Build SET clause from data
        const setClauses: string[] = [];
        const values: unknown[] = [];

        for (const [key, value] of Object.entries(data)) {
            // Skip internal columns
            if (key.startsWith('_') || key === 'id') continue;
            setClauses.push(`\`${key}\` = ?`);
            values.push(value);
        }

        if (setClauses.length === 0) {
            res.status(400).json({
                error: {
                    code: 'NO_DATA',
                    message: 'No valid columns to update',
                },
            });
            return;
        }

        // Add sync metadata
        setClauses.push('`_sync_source` = ?');
        values.push('DASHBOARD');
        setClauses.push('`_sync_timestamp` = NOW()');

        values.push(id);

        const sql = `UPDATE \`${tableName}\` SET ${setClauses.join(', ')} WHERE id = ?`;
        await mysqlClient.execute(sql, values);

        logger.info('MySQL row updated', { id });

        res.json({
            success: true,
            message: `Row ${id} updated`,
            source: 'mysql',
        });
    } catch (error) {
        logger.error('Error updating MySQL row', { error });
        res.status(500).json({
            error: {
                code: 'MYSQL_UPDATE_ERROR',
                message: 'Failed to update MySQL row',
            },
        });
    }
});

/**
 * POST /api/data/sheets
 * Add a new row to Google Sheet
 */
dataRouter.post('/sheets', async (req: Request, res: Response) => {
    try {
        const data = req.body as Record<string, unknown>;

        // Auto-populate default values if not provided
        const now = new Date();
        const formattedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

        const enrichedData: Record<string, unknown> = {
            ...data,
            // Set status to 'active' if not provided
            status: data['status'] || 'active',
            // Set created_at to current date if not provided
            created_at: data['created_at'] || formattedDate,
        };

        const sheetsClient = getSheetsClient();
        const rowNumber = await sheetsClient.appendRowAuto(enrichedData);

        logger.info('Sheet row added via API', { rowNumber });

        // Notify Sync Engine to replicate to MySQL
        const engine = getCoordinator().getDefaultEngine();
        if (engine) {
            engine.handleSheetChange({
                row: rowNumber,
                column: 0,
                operationType: 'INSERT',
                rowData: enrichedData,
                editedBy: 'DASHBOARD_API'
            });
        } else {
            logger.warn('No sync engine active to notify of sheet insert');
        }

        res.status(201).json({
            success: true,
            message: 'Row added',
            rowNumber,
            source: 'sheets',
        });
    } catch (error) {
        logger.error('Error adding Sheet row', { error });
        res.status(500).json({
            error: {
                code: 'SHEETS_INSERT_ERROR',
                message: 'Failed to add Google Sheets row',
            },
        });
    }
});

/**
 * POST /api/data/mysql
 * Add a new row to MySQL
 */
dataRouter.post('/mysql', async (req: Request, res: Response) => {
    try {
        const data = req.body as Record<string, unknown>;

        const config = getConfig();
        const mysqlClient = getMySQLClient();
        const tableName = config.sync.tableName;

        // Build INSERT statement
        const columns: string[] = [];
        const placeholders: string[] = [];
        const values: unknown[] = [];

        for (const [key, value] of Object.entries(data)) {
            // Skip internal columns
            if (key.startsWith('_') || key === 'id') continue;
            columns.push(`\`${key}\``);
            placeholders.push('?');
            values.push(value);
        }

        // Add sync metadata
        columns.push('`_sync_source`');
        placeholders.push('?');
        values.push('DASHBOARD');

        columns.push('`_sync_timestamp`');
        placeholders.push('NOW()');

        const sql = `INSERT INTO \`${tableName}\` (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
        const result = await mysqlClient.execute(sql, values);

        logger.info('MySQL row added', { insertId: result.insertId });

        res.status(201).json({
            success: true,
            message: 'Row added',
            id: result.insertId,
            source: 'mysql',
        });
    } catch (error) {
        logger.error('Error adding MySQL row', { error });
        res.status(500).json({
            error: {
                code: 'MYSQL_INSERT_ERROR',
                message: 'Failed to add MySQL row',
            },
        });
    }
});

/**
 * DELETE /api/data/sheets/:row
 * Delete a row from Google Sheet
 */
dataRouter.delete('/sheets/:row', async (req: Request, res: Response) => {
    try {
        const rowParam = req.params['row'];
        if (!rowParam) {
            res.status(400).json({
                error: {
                    code: 'MISSING_ROW',
                    message: 'Row parameter is required',
                },
            });
            return;
        }

        const rowNumber = parseInt(rowParam, 10);

        if (isNaN(rowNumber) || rowNumber < 2) {
            res.status(400).json({
                error: {
                    code: 'INVALID_ROW',
                    message: 'Row number must be 2 or greater',
                },
            });
            return;
        }

        const sheetsClient = getSheetsClient();
        await sheetsClient.deleteRow(rowNumber);

        logger.info('Sheet row deleted via API', { rowNumber });

        // Notify Sync Engine
        const engine = getCoordinator().getDefaultEngine();
        if (engine) {
            engine.handleSheetChange({
                row: rowNumber,
                column: 0,
                operationType: 'DELETE',
                editedBy: 'DASHBOARD_API'
            });
        } else {
            logger.warn('No sync engine active to notify of sheet deletion');
        }

        res.json({
            success: true,
            message: `Row ${rowNumber} deleted`,
            source: 'sheets',
        });
    } catch (error) {
        logger.error('Error deleting Sheet row', { error });
        res.status(500).json({
            error: {
                code: 'SHEETS_DELETE_ERROR',
                message: 'Failed to delete Google Sheets row',
            },
        });
    }
});

/**
 * DELETE /api/data/mysql/:id
 * Delete a row from MySQL
 */
dataRouter.delete('/mysql/:id', async (req: Request, res: Response) => {
    try {
        const idParam = req.params['id'];
        if (!idParam) {
            res.status(400).json({
                error: {
                    code: 'MISSING_ID',
                    message: 'ID parameter is required',
                },
            });
            return;
        }

        const id = parseInt(idParam, 10);

        if (isNaN(id) || id < 1) {
            res.status(400).json({
                error: {
                    code: 'INVALID_ID',
                    message: 'ID must be a positive integer',
                },
            });
            return;
        }

        const config = getConfig();
        const mysqlClient = getMySQLClient();
        const tableName = config.sync.tableName;

        const sql = `DELETE FROM \`${tableName}\` WHERE id = ?`;
        await mysqlClient.execute(sql, [id]);

        logger.info('MySQL row deleted', { id });

        res.json({
            success: true,
            message: `Row ${id} deleted`,
            source: 'mysql',
        });
    } catch (error) {
        logger.error('Error deleting MySQL row', { error });
        res.status(500).json({
            error: {
                code: 'MYSQL_DELETE_ERROR',
                message: 'Failed to delete MySQL row',
            },
        });
    }
});

/**
 * GET /api/data/info
 * Get connection info for both sources
 */
dataRouter.get('/info', (req: Request, res: Response) => {
    const config = getConfig();

    res.json({
        sheets: {
            spreadsheetId: config.sheets.spreadsheetId,
            sheetName: config.sheets.sheetName,
            url: `https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}/edit`,
        },
        mysql: {
            host: config.mysql.host,
            database: config.mysql.database,
            table: config.sync.tableName,
        },
    });
});
