
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('Processing login...');

    useEffect(() => {
        const code = searchParams.get('code');

        if (!code) {
            setStatus('No code found in URL');
            return;
        }

        const exchangeCode = async () => {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (!token) {
                setStatus('Not authenticated');
                return;
            }

            try {
                const res = await fetch('http://localhost:3000/api/auth/google/callback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ code })
                });

                if (res.ok) {
                    navigate('/');
                } else {
                    const err = await res.json();
                    setStatus(`Error: ${err.error}`);
                }
            } catch (e) {
                setStatus('Network error');
            }
        };

        exchangeCode();
    }, [searchParams, navigate]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="text-xl font-semibold">{status}</div>
        </div>
    );
}
