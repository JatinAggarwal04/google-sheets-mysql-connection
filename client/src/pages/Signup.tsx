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
    const { signup, isLoading, error, clearError } = useAuthStore();

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
