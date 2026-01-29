import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config/index.js';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('SupabaseClient');

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
    if (supabaseInstance) return supabaseInstance;

    const config = getConfig();
    const { url, serviceKey } = config.supabase;

    if (!url || !serviceKey) {
        logger.error('Supabase credentials missing. Check SUPABASE_URL and SUPABASE_SERVICE_KEY.');
        throw new Error('Supabase configuration missing');
    }

    supabaseInstance = createClient(url, serviceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        }
    });

    return supabaseInstance;
}
