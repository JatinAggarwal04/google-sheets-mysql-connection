import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export function AuthCallbackPage() {
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const error = searchParams.get('error');
        const connected = searchParams.get('google_connected');

        if (window.opener) {
            if (error) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error }, '*');
            } else if (connected === 'true') {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
            }
            // Close the window after a short delay to ensure message is sent
            setTimeout(() => {
                window.close();
            }, 1000);
        }
    }, [searchParams]);

    const error = searchParams.get('error');
    const connected = searchParams.get('google_connected');

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#0F172A',
            color: '#E2E8F0',
            fontFamily: 'sans-serif'
        }}>
            {error ? (
                <>
                    <XCircle size={48} className="text-danger" style={{ marginBottom: '1rem', color: '#EF4444' }} />
                    <h2>Connection Failed</h2>
                    <p>{error}</p>
                </>
            ) : connected === 'true' ? (
                <>
                    <CheckCircle size={48} className="text-success" style={{ marginBottom: '1rem', color: '#10B981' }} />
                    <h2>Successfully Connected!</h2>
                    <p>This window will close automatically...</p>
                    <button
                        onClick={() => window.close()}
                        style={{
                            marginTop: '1rem',
                            padding: '0.5rem 1rem',
                            backgroundColor: '#3B82F6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer'
                        }}
                    >
                        Close Window
                    </button>
                    <script dangerouslySetInnerHTML={{
                        __html: `
                        // Fallback close attempt
                        setTimeout(function() { window.close(); }, 3000);
                    `}} />
                </>
            ) : (
                <>
                    <Loader2 size={48} className="spin" style={{ marginBottom: '1rem', color: '#3B82F6', animation: 'spin 1s linear infinite' }} />
                    <h2>Processing...</h2>
                </>
            )}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
