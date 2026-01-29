// ===========================================
// Login Page
// ===========================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { Sheet, Database, Mail, Lock, ArrowRight } from 'lucide-react';
import './Auth.css';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, isLoading, error, clearError } = useAuthStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        try {
            await login(email, password);
        } catch {
            // Error is handled by store
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

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full"
                                disabled={isLoading}
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
