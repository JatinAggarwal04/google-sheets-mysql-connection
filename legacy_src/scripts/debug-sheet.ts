
import 'dotenv/config';
import { getConfig } from '../config/index.js';
import { getSheetsClient } from '../sheets/client.js';
import { createComponentLogger } from '../utils/logger.js';

// Mock logger to print to console
const logger = createComponentLogger('DebugScript');

async function testSheetAccess() {
    try {
        console.log('--- Starting Sheet Access Test ---');

        // Load config (this effectively loads env vars)
        const config = getConfig();
        console.log('Service Account Email:', config.sheets.serviceAccountEmail);

        // Target Sheet (from user input in browser test)
        const spreadsheetId = '1Dxd-l6cTiL5Dv0eEseK3WVKpNL0Pol0laW1S9k0xwL4';
        const sheetName = 'Sheet1';

        console.log(`Target Spreadsheet ID: ${spreadsheetId}`);
        console.log(`Target Sheet Name: ${sheetName}`);

        const client = getSheetsClient({ spreadsheetId, sheetName });

        console.log('Initializing client...');
        await client.initialize();
        console.log('Client initialized.');

        console.log('Fetching metadata...');
        const metadata = await client.getMetadata();
        console.log('Metadata retrieved:', metadata);

        console.log('Fetching rows...');
        const data = await client.getSheetData();
        console.log(`Rows found: ${data.rows.length}`);
        if (data.rows.length > 0) {
            console.log('First row sample:', data.rows[0]);
        } else {
            console.log('Sheet is empty.');
        }

    } catch (error) {
        console.error('ERROR:', error);
    }
}

testSheetAccess();
