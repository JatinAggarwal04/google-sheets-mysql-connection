// ===========================================
// Supabase Configuration
// ===========================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';
import type { Database } from '../types/database.js';

let supabaseAdmin: SupabaseClient<Database> | null = null;
let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Get Supabase admin client (uses service role key)
 * Use for server-side operations that bypass RLS
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
    if (supabaseAdmin) return supabaseAdmin;

    const env = getEnv();

    supabaseAdmin = createClient<Database>(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );

    return supabaseAdmin;
}

/**
 * Get Supabase public client (uses anon key)
 * Use for client-facing operations that respect RLS
 */
export function getSupabaseClient(): SupabaseClient<Database> {
    if (supabaseClient) return supabaseClient;

    const env = getEnv();

    supabaseClient = createClient<Database>(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
        {
            auth: {
                autoRefreshToken: true,
                persistSession: false,
            },
        }
    );

    return supabaseClient;
}
