import { google } from 'googleapis';
import { EncryptionService } from './encryption.service.js';

const SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly', // Read all files (to list sheets)
    'https://www.googleapis.com/auth/spreadsheets' // Read/Write spreadsheets
];

export class GoogleAuthService {
    private oauth2Client;
    private encryptionService: EncryptionService;

    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
        );
        this.encryptionService = new EncryptionService(process.env.ENCRYPTION_KEY || 'default-secret-key-must-be-changed');
    }

    /**
     * Generate the URL for Google Consent Screen
     */
    generateAuthUrl(state?: string): string {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', // Crucial for getting Refresh Token
            scope: SCOPES,
            state: state,
            prompt: 'consent' // Force consent to ensure we get a refresh token
        });
    }

    /**
     * Exchange code for tokens and encrypt them
     */
    async exchangeCodeForTokens(code: string) {
        const { tokens } = await this.oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
            console.warn('No refresh token received. User might have already authorized.');
            // In prod, we might need to prompt user to revoke access to get a new refresh token
        }

        const encrypted = this.encryptionService.encrypt(JSON.stringify(tokens));

        return {
            tokens, // Return raw for immediate use
            encryptedTokens: encrypted // For storage
        };
    }
}
