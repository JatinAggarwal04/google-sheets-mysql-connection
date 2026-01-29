// ===========================================
// Google Sheets Service
// ===========================================

import { google, sheets_v4 } from 'googleapis';
import { getAuthenticatedClient } from './google-oauth.service.js';
import { logger } from '../lib/logger.js';
import { ExternalServiceError } from '../lib/errors.js';

interface SheetInfo {
    spreadsheetId: string;
    title: string;
    sheets: Array<{
        sheetId: number;
        title: string;
        rowCount: number;
        columnCount: number;
    }>;
}

interface SheetData {
    headers: string[];
    rows: Record<string, unknown>[];
}

/**
 * Gets Sheets API client
 */
async function getSheetsClient(connectionId: string): Promise<sheets_v4.Sheets> {
    const auth = await getAuthenticatedClient(connectionId);
    return google.sheets({ version: 'v4', auth });
}

/**
 * Lists user's spreadsheets from Google Drive
 */
export async function listSpreadsheets(
    connectionId: string
): Promise<Array<{ id: string; name: string }>> {
    try {
        const auth = await getAuthenticatedClient(connectionId);
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.spreadsheet'",
            fields: 'files(id, name)',
            pageSize: 100,
            orderBy: 'modifiedTime desc',
        });

        return (response.data.files || []).map((file) => ({
            id: file.id!,
            name: file.name!,
        }));
    } catch (error) {
        logger.error('Failed to list spreadsheets:', error);
        throw new ExternalServiceError('Google Drive', 'Failed to list spreadsheets');
    }
}

/**
 * Gets spreadsheet metadata
 */
export async function getSpreadsheetInfo(
    connectionId: string,
    spreadsheetId: string
): Promise<SheetInfo> {
    try {
        const sheets = await getSheetsClient(connectionId);

        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'spreadsheetId,properties.title,sheets.properties',
        });

        const spreadsheet = response.data;

        return {
            spreadsheetId: spreadsheet.spreadsheetId!,
            title: spreadsheet.properties!.title!,
            sheets: (spreadsheet.sheets || []).map((sheet) => ({
                sheetId: sheet.properties!.sheetId!,
                title: sheet.properties!.title!,
                rowCount: sheet.properties!.gridProperties?.rowCount || 0,
                columnCount: sheet.properties!.gridProperties?.columnCount || 0,
            })),
        };
    } catch (error) {
        logger.error('Failed to get spreadsheet info:', error);
        throw new ExternalServiceError('Google Sheets', 'Failed to get spreadsheet info');
    }
}

/**
 * Gets data from a specific sheet
 */
export async function getSheetData(
    connectionId: string,
    spreadsheetId: string,
    sheetName: string
): Promise<SheetData> {
    try {
        const sheets = await getSheetsClient(connectionId);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'`,
            valueRenderOption: 'UNFORMATTED_VALUE',
            dateTimeRenderOption: 'FORMATTED_STRING',
        });

        const values = response.data.values || [];

        if (values.length === 0) {
            return { headers: [], rows: [] };
        }

        const headers = values[0].map((h: unknown) => String(h || ''));
        const rows = values.slice(1).map((row: unknown[]) => {
            const obj: Record<string, unknown> = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] ?? null;
            });
            return obj;
        });

        return { headers, rows };
    } catch (error) {
        logger.error('Failed to get sheet data:', error);
        throw new ExternalServiceError('Google Sheets', 'Failed to get sheet data');
    }
}

/**
 * Updates sheet data
 */
export async function updateSheetData(
    connectionId: string,
    spreadsheetId: string,
    sheetName: string,
    headers: string[],
    rows: Record<string, unknown>[]
): Promise<void> {
    try {
        const sheets = await getSheetsClient(connectionId);

        // Convert rows to 2D array
        const values = [
            headers,
            ...rows.map((row) => headers.map((h) => row[h] ?? '')),
        ];

        // Clear existing data
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${sheetName}'`,
        });

        // Write new data
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!A1`,
            valueInputOption: 'RAW',
            requestBody: { values },
        });

        logger.info(`Updated sheet ${sheetName} with ${rows.length} rows`);
    } catch (error) {
        logger.error('Failed to update sheet data:', error);
        throw new ExternalServiceError('Google Sheets', 'Failed to update sheet data');
    }
}

/**
 * Appends rows to sheet
 */
export async function appendSheetRows(
    connectionId: string,
    spreadsheetId: string,
    sheetName: string,
    headers: string[],
    rows: Record<string, unknown>[]
): Promise<void> {
    try {
        const sheets = await getSheetsClient(connectionId);

        const values = rows.map((row) => headers.map((h) => row[h] ?? ''));

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'${sheetName}'!A1`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values },
        });

        logger.info(`Appended ${rows.length} rows to sheet ${sheetName}`);
    } catch (error) {
        logger.error('Failed to append sheet rows:', error);
        throw new ExternalServiceError('Google Sheets', 'Failed to append rows');
    }
}

/**
 * Deletes rows from sheet by row indices (1-indexed)
 */
export async function deleteSheetRows(
    connectionId: string,
    spreadsheetId: string,
    sheetName: string,
    rowIndices: number[]
): Promise<void> {
    if (rowIndices.length === 0) return;

    try {
        const sheets = await getSheetsClient(connectionId);

        // Get sheet ID
        const info = await getSpreadsheetInfo(connectionId, spreadsheetId);
        const sheet = info.sheets.find((s) => s.title === sheetName);

        if (!sheet) {
            throw new Error(`Sheet ${sheetName} not found`);
        }

        // Sort descending to delete from bottom up
        const sortedIndices = [...rowIndices].sort((a, b) => b - a);

        const requests = sortedIndices.map((rowIndex) => ({
            deleteDimension: {
                range: {
                    sheetId: sheet.sheetId,
                    dimension: 'ROWS',
                    startIndex: rowIndex,
                    endIndex: rowIndex + 1,
                },
            },
        }));

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests },
        });

        logger.info(`Deleted ${rowIndices.length} rows from sheet ${sheetName}`);
    } catch (error) {
        logger.error('Failed to delete sheet rows:', error);
        throw new ExternalServiceError('Google Sheets', 'Failed to delete rows');
    }
}
