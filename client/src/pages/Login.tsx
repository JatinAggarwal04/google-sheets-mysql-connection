import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const { signIn, signUp, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state as any)?.from?.pathname || '/';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            if (isSignUp) {
                const { error, needsConfirmation } = await signUp(email, password);
                if (error) {
                    setError(error.message);
                } else if (needsConfirmation) {
                    setMessage('Check your email for a confirmation link!');
                } else {
                    navigate(from, { replace: true });
                }
            } else {
                const { error } = await signIn(email, password);
                if (error) {
                    setError(error.message);
                } else {
                    navigate(from, { replace: true });
                }
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setError('');
        const { error } = await signInWithGoogle();
        if (error) {
            setError(error.message);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1>Sheets ↔ MySQL Sync</h1>
                    <p className="auth-subtitle">Real-time bidirectional data synchronization</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <h2>{isSignUp ? 'Create Account' : 'Sign In'}</h2>

                    {error && <div className="auth-error">{error}</div>}
                    {message && <div className="auth-success">{message}</div>}

                    <div className="input-group">
                        <label htmlFor="email">Email Address</label>
                        <div className="input-wrapper">
                            <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <div className="input-wrapper">
                            <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <circle cx="12" cy="16" r="1" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                minLength={6}
                                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        <span>{loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}</span>
                        <svg className="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>

                    <div className="auth-divider">
                        <span>or continue with</span>
                    </div>

                    <button type="button" className="btn btn-google btn-full" onClick={handleGoogleAuth}>
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Google
                    </button>

                    <div className="auth-toggle">
                        <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
                        <button type="button" className="auth-toggle-btn" onClick={() => setIsSignUp(!isSignUp)}>
                            {isSignUp ? 'Sign In' : 'Sign Up'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
