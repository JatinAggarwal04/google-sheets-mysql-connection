
import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
    const { user, signOut } = useAuth();
    const [stats, setStats] = useState({ active: 0, failed: 0 });

    // TODO: Fetch real stats
    const refreshStats = () => setStats({ active: 0, failed: 0 });

    useEffect(() => {
        refreshStats();
    }, []);

    const handleGoogleConnect = async () => {
        try {
            // Get Auth URL from our API
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (!token) return;

            const res = await fetch('http://localhost:3000/api/auth/google/url', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const { url } = await res.json();

            // Redirect to Google
            window.location.href = url;
        } catch (error) {
            console.error('Failed to start Google Auth', error);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow">
                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Integrations</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">{user?.email}</span>
                        <Button variant="outline" onClick={signOut}>Sign Out</Button>
                    </div>
                </div>
            </header>
            <main>
                <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
                    {/* Actions */}
                    <div className="mb-8 flex justify-end">
                        <Button onClick={handleGoogleConnect} className="bg-blue-600 hover:bg-blue-500">
                            + Connect Google Drive
                        </Button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                            <dt className="truncate text-sm font-medium text-gray-500">Active Syncs</dt>
                            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.active}</dd>
                        </div>
                        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                            <dt className="truncate text-sm font-medium text-gray-500">Failed Jobs</dt>
                            <dd className="mt-1 text-3xl font-semibold tracking-tight text-red-600">{stats.failed}</dd>
                        </div>
                    </div>

                    {/* List Placeholder */}
                    <div className="mt-8">
                        <div className="overflow-hidden bg-white shadow sm:rounded-md">
                            <ul role="list" className="divide-y divide-gray-200">
                                <li className="px-6 py-4 text-center text-gray-500">
                                    No integrations found. Connect Google Drive to get started.
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
