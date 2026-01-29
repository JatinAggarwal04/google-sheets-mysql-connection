// ===========================================
// Google Routes
// ===========================================

import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import * as googleOAuth from '../services/google-oauth.service.js';
import * as googleSheets from '../services/google-sheets.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/google/connections
 * List Google connections
 */
router.get('/connections', async (req: Request, res: Response) => {
    try {
        const connections = await googleOAuth.listGoogleConnections(req.tenant!.id);

        // Remove sensitive data
        const safeConnections = connections.map((c) => ({
            id: c.id,
            email: c.email,
            scopes: c.scopes,
            isValid: c.is_valid,
            createdAt: c.created_at,
        }));

        res.json({
            success: true,
            data: safeConnections,
        });
    } catch (error) {
        logger.error('Failed to list Google connections:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list connections' },
        });
    }
});

/**
 * DELETE /api/google/connections/:id
 * Delete Google connection
 */
router.delete('/connections/:id', async (req: Request, res: Response) => {
    try {
        await googleOAuth.deleteGoogleConnection(req.tenant!.id, req.params.id);

        res.json({
            success: true,
            data: { message: 'Connection deleted' },
        });
    } catch (error) {
        logger.error('Failed to delete Google connection:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to delete connection' },
        });
    }
});

/**
 * GET /api/google/spreadsheets
 * List user's spreadsheets
 */
router.get('/spreadsheets', async (req: Request, res: Response) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'connectionId is required' },
            });
        }

        const spreadsheets = await googleSheets.listSpreadsheets(connectionId as string);

        res.json({
            success: true,
            data: spreadsheets,
        });
    } catch (error) {
        logger.error('Failed to list spreadsheets:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list spreadsheets' },
        });
    }
});

/**
 * GET /api/google/spreadsheets/:spreadsheetId
 * Get spreadsheet info with sheets
 */
router.get('/spreadsheets/:spreadsheetId', async (req: Request, res: Response) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'connectionId is required' },
            });
        }

        const info = await googleSheets.getSpreadsheetInfo(
            connectionId as string,
            req.params.spreadsheetId
        );

        res.json({
            success: true,
            data: info,
        });
    } catch (error) {
        logger.error('Failed to get spreadsheet info:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get spreadsheet info' },
        });
    }
});

/**
 * GET /api/google/spreadsheets/:spreadsheetId/sheets/:sheetName/data
 * Get sheet data
 */
router.get('/spreadsheets/:spreadsheetId/sheets/:sheetName/data', async (req: Request, res: Response) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'connectionId is required' },
            });
        }

        const data = await googleSheets.getSheetData(
            connectionId as string,
            req.params.spreadsheetId,
            decodeURIComponent(req.params.sheetName)
        );

        res.json({
            success: true,
            data,
        });
    } catch (error) {
        logger.error('Failed to get sheet data:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get sheet data' },
        });
    }
});

/**
 * Validates row data for null/empty values
 */
function validateRowData(row: Record<string, unknown>): { valid: boolean; emptyFields: string[] } {
    const emptyFields: string[] = [];
    for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined || value === '') {
            emptyFields.push(key);
        }
    }
    return { valid: emptyFields.length === 0, emptyFields };
}

/**
 * POST /api/google/spreadsheets/:spreadsheetId/sheets/:sheetName/rows
 * Append row to sheet
 */
router.post('/spreadsheets/:spreadsheetId/sheets/:sheetName/rows', async (req: Request, res: Response) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'connectionId is required' },
            });
        }

        const { headers, row } = req.body;
        if (!headers || !row) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'headers and row are required' },
            });
        }

        // Validate for null/empty values
        const validation = validateRowData(row);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Cannot save row with empty values. Please fill in: ${validation.emptyFields.join(', ')}`,
                    emptyFields: validation.emptyFields,
                },
            });
        }

        await googleSheets.appendSheetRows(
            connectionId as string,
            req.params.spreadsheetId,
            decodeURIComponent(req.params.sheetName),
            headers,
            [row]
        );

        res.status(201).json({
            success: true,
            data: { message: 'Row added successfully' },
        });
    } catch (error) {
        logger.error('Failed to add sheet row:', error);
        const message = error instanceof Error ? error.message : 'Failed to add row';
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message },
        });
    }
});

/**
 * PUT /api/google/spreadsheets/:spreadsheetId/sheets/:sheetName/rows/:rowIndex
 * Update row in sheet (rowIndex is 1-indexed, 2 = first data row)
 */
router.put('/spreadsheets/:spreadsheetId/sheets/:sheetName/rows/:rowIndex', async (req: Request, res: Response) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'connectionId is required' },
            });
        }

        const { headers, row } = req.body;
        if (!headers || !row) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'headers and row are required' },
            });
        }

        // Validate for null/empty values
        const validation = validateRowData(row);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Cannot save row with empty values. Please fill in: ${validation.emptyFields.join(', ')}`,
                    emptyFields: validation.emptyFields,
                },
            });
        }

        const rowIndex = parseInt(req.params.rowIndex, 10);
        if (isNaN(rowIndex) || rowIndex < 2) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid row index (must be >= 2)' },
            });
        }

        await googleSheets.updateSheetRow(
            connectionId as string,
            req.params.spreadsheetId,
            decodeURIComponent(req.params.sheetName),
            rowIndex,
            headers,
            row
        );

        res.json({
            success: true,
            data: { message: 'Row updated successfully' },
        });
    } catch (error) {
        logger.error('Failed to update sheet row:', error);
        const message = error instanceof Error ? error.message : 'Failed to update row';
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message },
        });
    }
});

/**
 * DELETE /api/google/spreadsheets/:spreadsheetId/sheets/:sheetName/rows/:rowIndex
 * Delete row from sheet (rowIndex is 1-indexed, 2 = first data row)
 */
router.delete('/spreadsheets/:spreadsheetId/sheets/:sheetName/rows/:rowIndex', async (req: Request, res: Response) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'connectionId is required' },
            });
        }

        const rowIndex = parseInt(req.params.rowIndex, 10);
        if (isNaN(rowIndex) || rowIndex < 2) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid row index (must be >= 2)' },
            });
        }

        await googleSheets.deleteSheetRows(
            connectionId as string,
            req.params.spreadsheetId,
            decodeURIComponent(req.params.sheetName),
            [rowIndex - 1] // Convert to 0-indexed for the service
        );

        res.json({
            success: true,
            data: { message: 'Row deleted successfully' },
        });
    } catch (error) {
        logger.error('Failed to delete sheet row:', error);
        const message = error instanceof Error ? error.message : 'Failed to delete row';
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message },
        });
    }
});

export default router;
