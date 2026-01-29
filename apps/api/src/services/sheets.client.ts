import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class GoogleSheetsClient {
    private sheets: sheets_v4.Sheets;
    private drive: drive_v3.Drive;

    constructor(auth: OAuth2Client) {
        this.sheets = google.sheets({ version: 'v4', auth });
        this.drive = google.drive({ version: 'v3', auth });
    }

    /**
     * List Spreadsheets
     */
    async listSpreadsheets() {
        try {
            const res = await this.drive.files.list({
                q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                fields: 'files(id, name, createdTime, modifiedTime)',
                pageSize: 20
            });
            return res.data.files || [];
        } catch (error) {
            console.error('Error listing spreadsheets:', error);
            throw error;
        }
    }

    /**
     * Read range from sheet
     */
    async readRange(spreadsheetId: string, range: string): Promise<string[][]> {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
                valueRenderOption: 'UNFORMATTED_VALUE', // Get raw values (numbers as numbers)
            });

            return (response.data.values as string[][]) || [];
        } catch (error) {
            console.error('Error reading sheet:', error);
            throw error;
        }
    }

    /**
     * Write/Update range
     */
    async updateRange(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED', // Recognize dates, formulas
                requestBody: { values },
            });
        } catch (error) {
            console.error('Error writing sheet:', error);
            throw error;
        }
    }

    /**
     * Append rows
     */
    async appendRows(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });
        } catch (error) {
            console.error('Error appending to sheet:', error);
            throw error;
        }
    }

    /**
     * Get Spreadsheet Metadata (Sheets, Titles)
     */
    async getMetadata(spreadsheetId: string) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId
        });
        return response.data;
    }
}
