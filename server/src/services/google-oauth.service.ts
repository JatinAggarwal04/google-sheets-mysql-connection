// ===========================================
// Google OAuth Service
// ===========================================

import { google, Auth } from 'googleapis';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { encryptCredentials, decryptCredentials } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { ExternalServiceError, NotFoundError } from '../lib/errors.js';
import type { GoogleConnection } from '../types/database.js';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
];

interface GoogleTokens {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    token_type: string;
    scope: string;
}

/**
 * Creates OAuth2 client
 */
function createOAuth2Client(): Auth.OAuth2Client {
    const env = getEnv();
    return new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
    );
}

/**
 * Generates authorization URL for OAuth flow
 */
export function getAuthorizationUrl(state: string): string {
    const oauth2Client = createOAuth2Client();

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state,
        prompt: 'consent',
        include_granted_scopes: true,
    });
}

/**
 * Exchanges authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    const oauth2Client = createOAuth2Client();

    try {
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
            throw new Error('No refresh token received. User may need to revoke access and try again.');
        }

        return {
            access_token: tokens.access_token!,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date!,
            token_type: tokens.token_type!,
            scope: tokens.scope!,
        };
    } catch (error) {
        logger.error('Failed to exchange code for tokens:', error);
        throw new ExternalServiceError('Google OAuth', 'Failed to exchange authorization code');
    }
}

/**
 * Gets user info from Google
 */
export async function getGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });

    try {
        const { data } = await oauth2.userinfo.get();
        return {
            email: data.email!,
            name: data.name || data.email!,
        };
    } catch (error) {
        logger.error('Failed to get user info:', error);
        throw new ExternalServiceError('Google OAuth', 'Failed to get user info');
    }
}

/**
 * Saves Google connection for tenant
 */
export async function saveGoogleConnection(
    tenantId: string,
    email: string,
    tokens: GoogleTokens
): Promise<GoogleConnection> {
    const supabase = getSupabaseAdmin();

    const encryptedTokens = encryptCredentials(tokens);

    // Upsert connection
    const { data, error } = await supabase
        .from('google_connections')
        .upsert(
            {
                tenant_id: tenantId,
                email,
                encrypted_tokens: encryptedTokens,
                scopes: tokens.scope.split(' '),
                is_valid: true,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id,email' }
        )
        .select()
        .single();

    if (error) {
        logger.error('Failed to save Google connection:', error);
        throw new Error('Failed to save Google connection');
    }

    return data;
}

/**
 * Gets Google connection for tenant
 */
export async function getGoogleConnection(
    tenantId: string,
    connectionId?: string
): Promise<GoogleConnection> {
    const supabase = getSupabaseAdmin();

    let query = supabase
        .from('google_connections')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_valid', true);

    if (connectionId) {
        query = query.eq('id', connectionId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
        throw new NotFoundError('Google connection');
    }

    return data;
}

/**
 * Gets authenticated OAuth2 client for a connection
 */
export async function getAuthenticatedClient(
    connectionId: string
): Promise<Auth.OAuth2Client> {
    const supabase = getSupabaseAdmin();

    const { data: connection, error } = await supabase
        .from('google_connections')
        .select('*')
        .eq('id', connectionId)
        .single();

    if (error || !connection) {
        throw new NotFoundError('Google connection');
    }

    const tokens = decryptCredentials<GoogleTokens>(connection.encrypted_tokens);
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
    });

    // Set up token refresh handler
    oauth2Client.on('tokens', async (newTokens) => {
        logger.info(`Refreshed tokens for connection ${connectionId}`);

        const updatedTokens: GoogleTokens = {
            ...tokens,
            access_token: newTokens.access_token!,
            expiry_date: newTokens.expiry_date!,
        };

        if (newTokens.refresh_token) {
            updatedTokens.refresh_token = newTokens.refresh_token;
        }

        const encryptedTokens = encryptCredentials(updatedTokens);

        await supabase
            .from('google_connections')
            .update({
                encrypted_tokens: encryptedTokens,
                updated_at: new Date().toISOString(),
            })
            .eq('id', connectionId);
    });

    return oauth2Client;
}

/**
 * Lists Google connections for tenant
 */
export async function listGoogleConnections(tenantId: string): Promise<GoogleConnection[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('google_connections')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_valid', true)
        .order('created_at', { ascending: false });

    if (error) {
        logger.error('Failed to list Google connections:', error);
        throw new Error('Failed to list Google connections');
    }

    return data || [];
}

/**
 * Deletes Google connection
 */
export async function deleteGoogleConnection(
    tenantId: string,
    connectionId: string
): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('google_connections')
        .delete()
        .eq('id', connectionId)
        .eq('tenant_id', tenantId);

    if (error) {
        logger.error('Failed to delete Google connection:', error);
        throw new Error('Failed to delete Google connection');
    }
}
