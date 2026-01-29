// ===========================================
// Authentication Middleware
// ===========================================

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AuthenticationError } from '../lib/errors.js';
import { getTenantByUserId, getOrCreateTenant } from '../services/tenant.service.js';
import type { Tenant } from '../types/database.js';

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
            };
            tenant?: Tenant;
        }
    }
}

/**
 * Extracts and validates JWT from request
 */
export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AuthenticationError('No token provided');
        }

        const token = authHeader.substring(7);
        const env = getEnv();

        // Create a temporary Supabase client to verify the token
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Verify token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            throw new AuthenticationError('Invalid token');
        }

        req.user = {
            id: user.id,
            email: user.email!,
        };

        // Get or create tenant
        try {
            req.tenant = await getTenantByUserId(user.id);
        } catch {
            // Create tenant if doesn't exist
            req.tenant = await getOrCreateTenant(
                user.id,
                user.email!,
                user.user_metadata?.name
            );
        }

        next();
    } catch (error) {
        if (error instanceof AuthenticationError) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'AUTHENTICATION_ERROR',
                    message: error.message,
                },
            });
        } else {
            logger.error('Auth middleware error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Authentication failed',
                },
            });
        }
    }
}

/**
 * Optional auth - doesn't fail if no token
 */
export async function optionalAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    return authMiddleware(req, res, next);
}
