import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut } from 'lucide-react';

interface HeaderProps {
    status?: 'connected' | 'disconnected' | 'connecting';
    statusText?: string;
}

export const Header: React.FC<HeaderProps> = ({ status = 'connected', statusText = 'System Ready' }) => {
    const { signOut } = useAuth();

    return (
        <header className="header">
            <div className="header-content justify-between w-full">
                <div className="flex items-center gap-4">
                    <div className="logo">
                        <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        <h1>Sheets ↔ MySQL Sync</h1>
                    </div>
                    {status && (
                        <div className="connection-status">
                            <span className={`status-dot ${status}`}></span>
                            <span className="status-text">{statusText}</span>
                        </div>
                    )}
                </div>

                <button
                    onClick={signOut}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-[#252525] rounded-md transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </header>
    );
};
