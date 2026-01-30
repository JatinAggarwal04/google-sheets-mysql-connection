// ===========================================
// Login Page
// ===========================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { Turnstile } from '@marsidev/react-turnstile';
import { Sheet, Database, Mail, Lock, ArrowRight } from 'lucide-react';
import './Auth.css';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [captchaToken, setCaptchaToken] = useState('');
    const { login, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        try {
            await login(email, password, captchaToken);
        } catch {
            // Error is handled by store
        }
    };

    const handleGoogleLogin = async () => {
        try {
            await loginWithGoogle();
        } catch {
            // Error handled by store
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                {/* Left Panel - Branding */}
                <div className="auth-branding">
                    <div className="auth-branding-content">
                        <div className="auth-logo">
                            <div className="auth-logo-icon">
                                <Sheet size={32} />
                                <Database size={20} className="auth-logo-overlay" />
                            </div>
                            <h1 className="auth-logo-text">SyncHub</h1>
                        </div>

                        <h2 className="auth-tagline">
                            Seamless Bidirectional Sync
                        </h2>
                        <p className="auth-description">
                            Connect your Google Sheets with MySQL databases.
                            Real-time synchronization, conflict resolution, and complete data integrity.
                        </p>

                        <div className="auth-features">
                            <div className="auth-feature">
                                <div className="auth-feature-icon">📊</div>
                                <span>Bidirectional Sync</span>
                            </div>
                            <div className="auth-feature">
                                <div className="auth-feature-icon">🔒</div>
                                <span>Secure OAuth</span>
                            </div>
                            <div className="auth-feature">
                                <div className="auth-feature-icon">⚡</div>
                                <span>Real-time Updates</span>
                            </div>
                        </div>
                    </div>

                    <div className="auth-branding-bg" />
                </div>

                {/* Right Panel - Form */}
                <div className="auth-form-panel">
                    <div className="auth-form-container">
                        <div className="auth-form-header">
                            <h3>Welcome back</h3>
                            <p>Sign in to your account to continue</p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-outline w-full mb-6"
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
                        >
                            <svg style={{ width: '20px', height: '20px', marginRight: '12px' }} viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                            Continue with Google
                        </button>

                        <div className="auth-divider">
                            <span>or continue with email</span>
                        </div>

                        <form onSubmit={handleSubmit} className="auth-form">
                            {error && (
                                <div className="auth-error">
                                    {error}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <div className="input-with-icon">
                                    <Mail size={18} className="input-icon" />
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <div className="input-with-icon">
                                    <Lock size={18} className="input-icon" />
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                                <Turnstile
                                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                                    onSuccess={(token) => setCaptchaToken(token)}
                                    onError={() => setCaptchaToken('')}
                                    onExpire={() => setCaptchaToken('')}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full"
                                disabled={isLoading || !captchaToken}
                            >
                                {isLoading ? (
                                    <div className="spinner" style={{ width: 20, height: 20 }} />
                                ) : (
                                    <>
                                        Sign In
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="auth-footer">
                            <p>
                                Don't have an account?{' '}
                                <Link to="/signup">Create one</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
