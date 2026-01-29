import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createComponentLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';

const logger = createComponentLogger('AuthMiddleware');

// Get credentials from env directly during init
// Note: We need to ensure these are available. 
// Vite prefixes are for frontend, but we can reuse or use standard names.
// Our .env uses VITE_SUPABASE_... so we read those.
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('Missing Supabase credentials in environment');
}

const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email?: string;
            };
        }
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.status(401).json({ error: 'Missing authorization header' });
        return;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            logger.warn('Invalid token', { error });
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        // Attach user to request
        req.user = {
            id: user.id,
            ...(user.email ? { email: user.email } : {})
        };

        next();
    } catch (error) {
        logger.error('Auth verification failed', { error });
        res.status(500).json({ error: 'Internal server error during auth' });
    }
};
