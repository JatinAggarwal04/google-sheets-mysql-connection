// ===========================================
// Auth Routes
// ===========================================

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as googleOAuth from '../services/google-oauth.service.js';
import * as tenant from '../services/tenant.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Temporary state storage (use Redis in production)
const pendingStates = new Map<string, { tenantId: string; timestamp: number }>();

// Clean up old states periodically
setInterval(() => {
    const now = Date.now();
    for (const [state, data] of pendingStates) {
        if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
            pendingStates.delete(state);
        }
    }
}, 60000);

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow - returns URL for client to open
 */
router.get('/google', authMiddleware, async (req: Request, res: Response) => {
    try {
        const state = uuidv4();
        pendingStates.set(state, {
            tenantId: req.tenant!.id,
            timestamp: Date.now(),
        });

        const authUrl = googleOAuth.getAuthorizationUrl(state);

        res.json({
            success: true,
            data: { authUrl },
        });
    } catch (error) {
        logger.error('Failed to generate auth URL:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate OAuth' },
        });
    }
});

/**
 * GET /api/auth/google/callback
 * OAuth callback handler
 */
router.get('/google/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    const env = getEnv();

    if (error) {
        return res.redirect(`${env.CLIENT_URL}/dashboard?error=google_auth_denied`);
    }

    if (!code || !state) {
        return res.redirect(`${env.CLIENT_URL}/dashboard?error=invalid_callback`);
    }

    const stateData = pendingStates.get(state as string);

    if (!stateData) {
        return res.redirect(`${env.CLIENT_URL}/dashboard?error=invalid_state`);
    }

    pendingStates.delete(state as string);

    try {
        // Exchange code for tokens
        const tokens = await googleOAuth.exchangeCodeForTokens(code as string);

        // Get user info
        const userInfo = await googleOAuth.getGoogleUserInfo(tokens.access_token);

        // Save connection
        await googleOAuth.saveGoogleConnection(
            stateData.tenantId,
            userInfo.email,
            tokens
        );

        logger.info(`Google connection saved for tenant ${stateData.tenantId}`);

        res.redirect(`${env.CLIENT_URL}/auth-callback?google_connected=true`);
    } catch (error) {
        logger.error('OAuth callback error:', error);
        res.redirect(`${env.CLIENT_URL}/auth-callback?error=oauth_failed`);
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            user: req.user,
            tenant: req.tenant,
        },
    });
});

export default router;
