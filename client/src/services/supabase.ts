import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://txnyrglqompyfdkeesja.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bnlyZ2xxb21weWZka2Vlc2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjQsImV4cCI6MjA1MzcxMDQ2NH0.iYYZK2PScHvWt5hJvPwBmTXsgteoP_4LRbKPLnLt9XY';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (!supabaseInstance) {
        supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseInstance;
}

export const supabase = getSupabase();
