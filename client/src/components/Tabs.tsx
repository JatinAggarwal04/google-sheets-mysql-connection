import React from 'react';

type TabId = 'status' | 'sheets' | 'mysql';

interface TabsProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

export const Tabs: React.FC<TabsProps> = ({ activeTab, onTabChange }) => {
    return (
        <nav className="tabs">
            <button
                className={`tab ${activeTab === 'status' ? 'active' : ''}`}
                onClick={() => onTabChange('status')}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6" />
                    <path d="M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                </svg>
                Status
            </button>
            <button
                className={`tab ${activeTab === 'sheets' ? 'active' : ''}`}
                onClick={() => onTabChange('sheets')}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                Google Sheets
            </button>
            <button
                className={`tab ${activeTab === 'mysql' ? 'active' : ''}`}
                onClick={() => onTabChange('mysql')}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
                MySQL
            </button>
        </nav>
    );
};
