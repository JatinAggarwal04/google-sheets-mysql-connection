import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, captchaToken?: string) => Promise<{ error: Error | null; needsConfirmation?: boolean }>;
    signInWithGoogle: () => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if there's an auth callback hash in the URL
        const hasAuthCallback = window.location.hash.includes('access_token') ||
            window.location.hash.includes('error');

        // IMPORTANT: Set up auth state listener FIRST
        // Supabase v2 automatically detects hash fragments and fires events
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state change:', event, session?.user?.email);
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);

            // Clean up the URL hash after successful OAuth
            if (event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
                window.history.replaceState(null, '', window.location.pathname);
            }
        });

        // Then get initial session (this will also trigger onAuthStateChange if hash is present)
        const initSession = async () => {
            // If there's an OAuth callback, give Supabase a moment to process the hash
            if (hasAuthCallback) {
                console.log('OAuth callback detected, waiting for Supabase to process...');
                // Supabase should auto-detect the hash, but we add a timeout as fallback
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('Error getting session:', error);
            }

            // Only update if we don't have a session yet (avoid race condition with listener)
            if (!session) {
                setLoading(false);
            }
        };

        initSession();

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    const signUp = async (email: string, password: string, captchaToken?: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: captchaToken ? { captchaToken } : undefined,
        });

        if (error) {
            return { error: error as Error | null };
        }

        // Check if email confirmation is required
        if (data.user && !data.session) {
            return { error: null, needsConfirmation: true };
        }

        return { error: null };
    };

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // Redirect directly to login page to preserve hash fragment
                redirectTo: `${window.location.origin}/login`,
            },
        });
        return { error: error as Error | null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
