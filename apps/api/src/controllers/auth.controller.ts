import { Request, Response } from 'express';
import { GoogleAuthService } from '../services/google-auth.service.js';
import { createClient } from '@supabase/supabase-js';

const googleAuth = new GoogleAuthService();

export const getGoogleAuthUrl = (req: Request, res: Response) => {
    // We can pass user ID in state if needed, but for now we trust the flow
    // Frontend calls this, gets URL, redirects.
    // Callback goes to Frontend, Frontend sends code + auth token to API.
    const url = googleAuth.generateAuthUrl(req.user?.id);
    res.json({ url });
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    const { code } = req.body;
    const userId = req.user?.id;

    if (!code || !userId) {
        return res.status(400).json({ error: 'Missing code or user context' });
    }

    try {
        const { tokens, encryptedTokens } = await googleAuth.exchangeCodeForTokens(code);

        // Store in Supabase 'user_credentials' table
        // We use the supabase client attached to request (which is user-scoped? No, user-scoped might not have Insert permission on internals)
        // Wait, 'user_credentials' table has RLS "No access for anon/authenticated".
        // ONLY Service Role can write to it.
        // We need a Service Role client here. Middleware gave us a user-scoped client?
        // Let's verify middleware. Middleware uses ANON key but gets user.
        // We need PRIVILEGED access to write secrets.

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        const { error } = await adminClient
            .from('user_credentials')
            .insert({
                user_id: userId,
                provider: 'google',
                encrypted_data: encryptedTokens.encryptedData,
                iv: encryptedTokens.iv,
                auth_tag: encryptedTokens.authTag, // Added this
                key_fingerprint: 'v1', // TODO: manages keys
                metadata: {
                    email: 'TODO: fetch from google user info' // We should fetch profile
                }
            });

        if (error) {
            console.error('Supabase write error:', error);
            return res.status(500).json({ error: 'Failed to save credentials' });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Google callback error:', error);
        res.status(500).json({ error: 'OAuth exchange failed' });
    }
};
