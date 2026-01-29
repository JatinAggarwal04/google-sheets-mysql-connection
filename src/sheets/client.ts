import { google, sheets_v4 } from 'googleapis';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { SheetsApiError } from '../utils/errors.js';

const logger = createComponentLogger('SheetsClient');

/**
 * Cell value with position information
 */
export interface CellData {
    row: number;
    column: number;
    columnLetter: string;
    value: unknown;
}

/**
 * Sheet data with headers and rows
 */
export interface SheetData {
    headers: string[];
    rows: Array<{
        rowNumber: number;
        data: Record<string, unknown>;
    }>;
}

/**
 * Google Sheets API client wrapper
 */
export class SheetsClient {
    private sheets: sheets_v4.Sheets | null = null;
    private spreadsheetId: string;
    private sheetName: string;
    private isInitialized = false;

    // Rate limiting state
    private requestCount = 0;
    private lastResetTime = Date.now();
    private readonly MAX_REQUESTS_PER_MINUTE = 60;

    constructor(config?: { spreadsheetId: string; sheetName: string }) {
        const globalConfig = getConfig();
        this.spreadsheetId = config?.spreadsheetId ?? globalConfig.sheets.spreadsheetId;
        this.sheetName = config?.sheetName ?? globalConfig.sheets.sheetName;
    }

    /**
     * Initialize the Sheets API client with service account credentials
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const config = getConfig();

        try {
            let auth;

            if (config.sheets.credentials) {
                // Use service account credentials
                const credentials = config.sheets.credentials as {
                    client_email: string;
                    private_key: string;
                };

                auth = new google.auth.GoogleAuth({
                    credentials: {
                        client_email: credentials.client_email,
                        private_key: credentials.private_key,
                    },
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else {
                throw new SheetsApiError(
                    'No Google credentials configured. Set GOOGLE_PRIVATE_KEY_PATH in environment.'
                );
            }

            this.sheets = google.sheets({ version: 'v4', auth });
            this.isInitialized = true;

            logger.info('Google Sheets client initialized', {
                spreadsheetId: this.spreadsheetId,
                sheetName: this.sheetName,
            });
        } catch (error) {
            throw new SheetsApiError('Failed to initialize Google Sheets client', {
                cause: error instanceof Error ? error : new Error(String(error)),
            });
        }
    }

    /**
     * Check and enforce rate limiting
     */
    private async checkRateLimit(): Promise<void> {
        const now = Date.now();

        // Reset counter every minute
        if (now - this.lastResetTime > 60000) {
            this.requestCount = 0;
            this.lastResetTime = now;
        }

        if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
            const waitTime = 60000 - (now - this.lastResetTime);
            logger.warn('Rate limit reached, waiting', { waitTimeMs: waitTime });
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.requestCount = 0;
            this.lastResetTime = Date.now();
        }

        this.requestCount++;
    }

    /**
     * Execute API call with exponential backoff retry
     */
    private async withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await this.checkRateLimit();
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Check if retryable error
                const isRetryable =
                    lastError.message.includes('Rate Limit') ||
                    lastError.message.includes('RESOURCE_EXHAUSTED') ||
                    lastError.message.includes('503');

                if (!isRetryable || attempt === maxRetries - 1) {
                    throw lastError;
                }

                const delay = Math.pow(2, attempt) * 1000;
                logger.warn('Retrying API call after error', {
                    attempt: attempt + 1,
                    delayMs: delay,
                    error: lastError.message,
                });

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Get all data from the sheet
     */
    async getSheetData(): Promise<SheetData> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        const range = `${this.sheetName}!A:ZZ`;

        try {
            const response = await this.withRetry(() =>
                this.sheets!.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range,
                })
            );

            const values = response.data.values ?? [];

            if (values.length === 0) {
                return { headers: [], rows: [] };
            }

            // First row is headers
            const headers = (values[0] as unknown[]).map((h) => String(h ?? ''));

            const rows = values.slice(1).map((rowValues, index) => {
                const rowNumber = index + 2; // +2 because: 1-indexed and skip header
                const data: Record<string, unknown> = {};

                headers.forEach((header, colIndex) => {
                    if (header) {
                        data[header] = (rowValues as unknown[])[colIndex] ?? null;
                    }
                });

                return { rowNumber, data };
            });

            logger.debug('Sheet data retrieved', {
                headerCount: headers.length,
                rowCount: rows.length,
            });

            return { headers, rows };
        } catch (error) {
            throw new SheetsApiError('Failed to retrieve sheet data', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { spreadsheetId: this.spreadsheetId, sheetName: this.sheetName },
            });
        }
    }

    /**
     * Update specific cells in the sheet
     */
    async updateCells(
        updates: Array<{ row: number; column: number; value: unknown }>
    ): Promise<void> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        if (updates.length === 0) return;

        try {
            const data = updates.map(({ row, column, value }) => ({
                range: `${this.sheetName}!${this.columnToLetter(column)}${row}`,
                values: [[value]],
            }));

            await this.withRetry(() =>
                this.sheets!.spreadsheets.values.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data,
                    },
                })
            );

            logger.info('Cells updated', { updateCount: updates.length });
        } catch (error) {
            throw new SheetsApiError('Failed to update cells', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { updateCount: updates.length },
            });
        }
    }

    /**
     * Update a full row by row number
     */
    async updateRow(
        rowNumber: number,
        data: Record<string, unknown>,
        headers: string[]
    ): Promise<void> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        const values = headers.map(header => data[header] ?? '');
        const range = `${this.sheetName}!A${rowNumber}:${this.columnToLetter(headers.length)}${rowNumber}`;

        try {
            await this.withRetry(() =>
                this.sheets!.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [values] },
                })
            );

            logger.info('Row updated', { rowNumber });
        } catch (error) {
            throw new SheetsApiError('Failed to update row', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { rowNumber },
            });
        }
    }

    /**
     * Append a new row to the sheet
     */
    async appendRow(data: Record<string, unknown>, headers: string[]): Promise<number> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        const values = headers.map(header => data[header] ?? '');
        const range = `${this.sheetName}!A:${this.columnToLetter(headers.length)}`;

        try {
            const response = await this.withRetry(() =>
                this.sheets!.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [values] },
                })
            );

            // Extract the row number from the updated range
            const updatedRange = response.data.updates?.updatedRange ?? '';
            const match = updatedRange.match(/!A(\d+):/);
            const rowNumber = match ? parseInt(match[1] ?? '0', 10) : 0;

            logger.info('Row appended', { rowNumber });
            return rowNumber;
        } catch (error) {
            throw new SheetsApiError('Failed to append row', {
                cause: error instanceof Error ? error : new Error(String(error)),
            });
        }
    }

    /**
     * Delete a row (by clearing it - Sheets API doesn't have direct delete)
     */
    async clearRow(rowNumber: number, columnCount: number): Promise<void> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        const range = `${this.sheetName}!A${rowNumber}:${this.columnToLetter(columnCount)}${rowNumber}`;

        try {
            await this.withRetry(() =>
                this.sheets!.spreadsheets.values.clear({
                    spreadsheetId: this.spreadsheetId,
                    range,
                })
            );

            logger.info('Row cleared', { rowNumber });
        } catch (error) {
            throw new SheetsApiError('Failed to clear row', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { rowNumber },
            });
        }
    }

    /**
     * Convert column number to letter (1 = A, 2 = B, ..., 27 = AA)
     */
    private columnToLetter(column: number): string {
        let temp = column;
        let letter = '';

        while (temp > 0) {
            const mod = (temp - 1) % 26;
            letter = String.fromCharCode(65 + mod) + letter;
            temp = Math.floor((temp - mod) / 26);
        }

        return letter;
    }

    /**
     * Get spreadsheet metadata
     */
    async getMetadata(): Promise<{
        title: string;
        sheetId: number;
        rowCount: number;
        columnCount: number;
    }> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        try {
            const response = await this.withRetry(() =>
                this.sheets!.spreadsheets.get({
                    spreadsheetId: this.spreadsheetId,
                })
            );

            const sheet = response.data.sheets?.find(
                (s) => s.properties?.title === this.sheetName
            );

            if (!sheet) {
                throw new SheetsApiError(`Sheet "${this.sheetName}" not found`);
            }

            return {
                title: response.data.properties?.title ?? '',
                sheetId: sheet.properties?.sheetId ?? 0,
                rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
                columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
            };
        } catch (error) {
            if (error instanceof SheetsApiError) throw error;
            throw new SheetsApiError('Failed to get spreadsheet metadata', {
                cause: error instanceof Error ? error : new Error(String(error)),
            });
        }
    }

    /**
     * Get all rows as simple data objects
     */
    async getAllRows(): Promise<Record<string, unknown>[]> {
        const sheetData = await this.getSheetData();
        return sheetData.rows.map(r => ({ _rowNumber: r.rowNumber, ...r.data }));
    }

    /**
     * Update a row by row number (auto-fetches headers)
     */
    async updateRowAuto(rowNumber: number, data: Record<string, unknown>): Promise<void> {
        const sheetData = await this.getSheetData();
        await this.updateRow(rowNumber, data, sheetData.headers);
    }

    /**
     * Append a new row (auto-fetches headers)
     */
    async appendRowAuto(data: Record<string, unknown>): Promise<number> {
        const sheetData = await this.getSheetData();
        return this.appendRow(data, sheetData.headers);
    }

    /**
     * Delete a row (actually removes it from the sheet)
     */
    async deleteRow(rowNumber: number): Promise<void> {
        if (!this.sheets) {
            throw new SheetsApiError('Sheets client not initialized');
        }

        try {
            const metadata = await this.getMetadata();

            await this.withRetry(() =>
                this.sheets!.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    requestBody: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: metadata.sheetId,
                                    dimension: 'ROWS',
                                    startIndex: rowNumber - 1, // 0-indexed
                                    endIndex: rowNumber,
                                },
                            },
                        }],
                    },
                })
            );

            logger.info('Row deleted', { rowNumber });
        } catch (error) {
            throw new SheetsApiError('Failed to delete row', {
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { rowNumber },
            });
        }
    }

    /**
     * Check if initialized
     */
    getIsInitialized(): boolean {
        return this.isInitialized;
    }
}

// Singleton instance
let sheetsClientInstance: SheetsClient | null = null;

/**
 * Get the Sheets client singleton
 */
export function getSheetsClient(config?: { spreadsheetId: string; sheetName: string }): SheetsClient {
    if (config) {
        return new SheetsClient(config);
    }

    if (!sheetsClientInstance) {
        sheetsClientInstance = new SheetsClient();
    }
    return sheetsClientInstance;
}
