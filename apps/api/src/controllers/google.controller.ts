import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { EncryptionService } from '../services/encryption.service.js';
import { GoogleSheetsClient } from '../services/sheets.client.js';
import { google } from 'googleapis';

export const listSpreadsheets = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

        // Fetch credentials
        const { data: credentials, error } = await supabase
            .from('user_credentials')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'google')
            .single();

        if (error || !credentials) {
            return res.status(404).json({ error: 'Google account not connected' });
        }

        // Decrypt
        const encryptionService = new EncryptionService(config.encryptionKey);
        const tokensString = encryptionService.decrypt(
            credentials.encrypted_data,
            credentials.iv,
            credentials.auth_tag
        );
        const tokens = JSON.parse(tokensString);

        // Client
        const oauth2Client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret
        );
        oauth2Client.setCredentials(tokens);
        const client = new GoogleSheetsClient(oauth2Client);

        // List
        const files = await client.listSpreadsheets();
        res.json({ files });
    } catch (error) {
        console.error('List spreadsheets error:', error);
        res.status(500).json({ error: 'Failed to list spreadsheets' });
    }
};

export const getSpreadsheetDetails = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

        // Fetch credentials
        const { data: credentials, error } = await supabase
            .from('user_credentials')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'google')
            .single();

        if (error || !credentials) {
            return res.status(404).json({ error: 'Google account not connected' });
        }

        // Decrypt
        const encryptionService = new EncryptionService(config.encryptionKey);
        const tokensString = encryptionService.decrypt(
            credentials.encrypted_data,
            credentials.iv,
            credentials.auth_tag
        );
        const tokens = JSON.parse(tokensString);

        // Client
        const oauth2Client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret
        );
        oauth2Client.setCredentials(tokens);
        const client = new GoogleSheetsClient(oauth2Client);

        // Get Metadata (Tabs)
        const metadata = await client.getMetadata(id);
        const sheets = metadata.sheets || [];

        // For each sheet, try to fetch header row (first row) to help mapping
        const details = await Promise.all(sheets.map(async (sheet) => {
            const title = sheet.properties?.title || 'Untitled';
            try {
                // Fetch A1:Z1
                const rows = await client.readRange(id, `${title}!A1:Z1`);
                return {
                    title,
                    sheetId: sheet.properties?.sheetId,
                    headers: rows[0] || []
                };
            } catch (e) {
                return {
                    title,
                    sheetId: sheet.properties?.sheetId,
                    headers: [],
                    error: 'Could not read headers'
                };
            }
        }));

        res.json({ spreadsheetId: id, sheets: details });

    } catch (error) {
        console.error('Get spreadsheet details error:', error);
        res.status(500).json({ error: 'Failed to get spreadsheet details' });
    }
};
