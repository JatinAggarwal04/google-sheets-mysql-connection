// ===========================================
// Signup Page
// ===========================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { Sheet, Database, Mail, Lock, User, ArrowRight } from 'lucide-react';
import './Auth.css';

export function SignupPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [validationError, setValidationError] = useState('');
    const { signup, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        setValidationError('');

        if (password !== confirmPassword) {
            setValidationError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setValidationError('Password must be at least 6 characters');
            return;
        }

        try {
            await signup(email, password, name);
        } catch {
            // Error is handled by store
        }
    };

    const handleGoogleSignup = async () => {
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
                            Start Syncing Today
                        </h2>
                        <p className="auth-description">
                            Create your account and connect your data sources in minutes.
                            No credit card required.
                        </p>

                        <div className="auth-features">
                            <div className="auth-feature">
                                <div className="auth-feature-icon">✨</div>
                                <span>Free to Start</span>
                            </div>
                            <div className="auth-feature">
                                <div className="auth-feature-icon">🚀</div>
                                <span>Quick Setup</span>
                            </div>
                            <div className="auth-feature">
                                <div className="auth-feature-icon">🛡️</div>
                                <span>Enterprise Security</span>
                            </div>
                        </div>
                    </div>

                    <div className="auth-branding-bg" />
                </div>

                {/* Right Panel - Form */}
                <div className="auth-form-panel">
                    <div className="auth-form-container">
                        <div className="auth-form-header">
                            <h3>Create your account</h3>
                            <p>Get started with SyncHub today</p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-outline w-full mb-6"
                            onClick={handleGoogleSignup}
                            disabled={isLoading}
                        >
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
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
                            Sign up with Google
                        </button>

                        <div className="auth-divider">
                            <span>or sign up with email</span>
                        </div>

                        <form onSubmit={handleSubmit} className="auth-form">
                            {(error || validationError) && (
                                <div className="auth-error">
                                    {error || validationError}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Name (optional)</label>
                                <div className="input-with-icon">
                                    <User size={18} className="input-icon" />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="John Doe"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                            </div>

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

                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <div className="input-with-icon">
                                    <Lock size={18} className="input-icon" />
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
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
                                        Create Account
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="auth-footer">
                            <p>
                                Already have an account?{' '}
                                <Link to="/login">Sign in</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
