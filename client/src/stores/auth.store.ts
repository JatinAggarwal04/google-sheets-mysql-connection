// ===========================================
// Auth Store (Zustand)
// ===========================================

import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface User {
    id: string;
    email: string;
}

interface Tenant {
    id: string;
    email: string;
    name: string | null;
}

interface AuthState {
    user: User | null;
    tenant: Tenant | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    initialize: () => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    signup: (email: string, password: string, name?: string) => Promise<void>;
    logout: () => Promise<void>;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    tenant: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    initialize: async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                set({
                    user: {
                        id: session.user.id,
                        email: session.user.email!,
                    },
                    isAuthenticated: true,
                    isLoading: false,
                });
            } else {
                set({ isLoading: false });
            }

            // Listen for auth changes
            supabase.auth.onAuthStateChange((_event, session) => {
                if (session?.user) {
                    set({
                        user: {
                            id: session.user.id,
                            email: session.user.email!,
                        },
                        isAuthenticated: true,
                    });
                } else {
                    set({
                        user: null,
                        tenant: null,
                        isAuthenticated: false,
                    });
                }
            });
        } catch (error) {
            set({ isLoading: false });
        }
    },

    login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (data.user) {
                set({
                    user: {
                        id: data.user.id,
                        email: data.user.email!,
                    },
                    isAuthenticated: true,
                    isLoading: false,
                });
            }
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Login failed',
                isLoading: false,
            });
            throw error;
        }
    },

    loginWithGoogle: async () => {
        set({ isLoading: true, error: null });

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`,
                },
            });

            if (error) throw error;
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Google login failed',
                isLoading: false,
            });
            throw error;
        }
    },

    signup: async (email: string, password: string, name?: string) => {
        set({ isLoading: true, error: null });

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name },
                },
            });

            if (error) throw error;

            if (data.user) {
                set({
                    user: {
                        id: data.user.id,
                        email: data.user.email!,
                    },
                    isAuthenticated: true,
                    isLoading: false,
                });
            }
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Signup failed',
                isLoading: false,
            });
            throw error;
        }
    },

    logout: async () => {
        await supabase.auth.signOut();
        set({
            user: null,
            tenant: null,
            isAuthenticated: false,
        });
    },

    clearError: () => {
        set({ error: null });
    },
}));

// Initialize auth on load
useAuthStore.getState().initialize();
