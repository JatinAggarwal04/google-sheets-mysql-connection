import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import * as api from '../services/api';
import type { Connection, SyncStatus, WebSocketMessage } from '../types';

export default function Dashboard() {
    const { user, signOut } = useAuth();
    const [connections, setConnections] = useState<Connection[]>([]);
    const [currentConnection, setCurrentConnection] = useState<Connection | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [eventLog, setEventLog] = useState<{ time: string; type: string; message: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'status' | 'sheets' | 'mysql'>('status');
    const [showNewConnModal, setShowNewConnModal] = useState(false);
    const [error, setError] = useState('');

    // Sheets/MySQL data
    const [sheetsData, setSheetsData] = useState<{ headers: string[]; rows: any[] } | null>(null);
    const [mysqlData, setMysqlData] = useState<{ columns: string[]; rows: any[] } | null>(null);

    // WebSocket for real-time updates
    const { isConnected: rawIsConnected } = useWebSocket({
        onMessage: (msg: WebSocketMessage) => {
            addLogEntry(msg.type, JSON.stringify(msg.data || {}));

            // Update status on certain events
            if (['sync:complete', 'status:update'].includes(msg.type)) {
                loadSyncStatus();
            }
        },
    });

    // Debounced connection status to prevent flickering
    const [isConnected, setIsConnected] = useState(rawIsConnected);
    useEffect(() => {
        if (rawIsConnected) {
            setIsConnected(true);
        } else {
            // Delay showing disconnected state to avoid flicker on quick reconnects
            const timer = setTimeout(() => setIsConnected(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [rawIsConnected]);

    const addLogEntry = (type: string, message: string) => {
        setEventLog((prev) => [
            { time: new Date().toLocaleTimeString(), type, message },
            ...prev.slice(0, 99),
        ]);
    };

    // Load connections on mount
    useEffect(() => {
        loadConnections();
    }, []);

    // Load sync status when connection changes
    useEffect(() => {
        if (currentConnection) {
            loadSyncStatus();
        }
    }, [currentConnection]);

    // Load data when tab changes
    useEffect(() => {
        if (!currentConnection) return;

        if (activeTab === 'sheets') {
            loadSheetsData();
        } else if (activeTab === 'mysql') {
            loadMySQLData();
        }
    }, [activeTab, currentConnection]);

    const loadConnections = async () => {
        try {
            const data = await api.fetchConnections();
            setConnections(data);
            if (data.length > 0 && !currentConnection) {
                setCurrentConnection(data[0]);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadSyncStatus = async () => {
        try {
            const status = await api.fetchSyncStatus(currentConnection?.id);
            setSyncStatus(status);
        } catch (err) {
            console.error('Failed to load sync status:', err);
        }
    };

    const loadSheetsData = async () => {
        if (!currentConnection?.id) return;
        try {
            setSheetsData(null); // Reset while loading
            const data = await api.fetchSheetsData(currentConnection.id);
            setSheetsData(data);
        } catch (err) {
            console.error('Failed to load sheets data:', err);
            setSheetsData({ headers: [], rows: [] }); // Empty on error
        }
    };

    const loadMySQLData = async () => {
        if (!currentConnection?.id) return;
        try {
            setMysqlData(null); // Reset while loading
            const data = await api.fetchMySQLData(currentConnection.id);
            setMysqlData(data);
        } catch (err) {
            console.error('Failed to load MySQL data:', err);
            setMysqlData({ columns: [], rows: [] }); // Empty on error
        }
    };

    const handleTriggerSync = async () => {
        try {
            await api.triggerSync(currentConnection?.id);
            addLogEntry('info', 'Manual sync triggered');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDeleteConnection = async () => {
        if (!currentConnection) return;
        if (!confirm('Are you sure you want to delete this connection?')) return;

        try {
            // ID is string now
            await api.deleteConnection(currentConnection.id as any);
            setCurrentConnection(null);
            await loadConnections();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleCreateConnection = async (data: any) => {
        try {
            await api.createConnection(data);
            setShowNewConnModal(false);
            await loadConnections();
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <div className="logo">
                        <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        <h1>Sheets ↔ MySQL Sync</h1>
                    </div>
                    <div className="header-right">
                        {/* Connection Selector */}
                        <div className="connection-selector">
                            <select
                                value={currentConnection?.id || ''}
                                onChange={(e) => {
                                    // Use string value directly (UUID)
                                    const conn = connections.find((c) => c.id === e.target.value);
                                    setCurrentConnection(conn || null);
                                }}
                                className="connection-dropdown"
                            >
                                <option value="">Select Connection...</option>
                                {connections.map((conn) => (
                                    <option key={conn.id} value={conn.id}>{conn.name}</option>
                                ))}
                            </select>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowNewConnModal(true)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                New
                            </button>
                        </div>
                        {/* Connection Status */}
                        <div className="connection-status">
                            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
                            <span className="status-text">{isConnected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                        {/* User Menu */}
                        <div className="user-menu">
                            <span className="user-email">{user?.email}</span>
                            <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <nav className="tabs">
                <button className={`tab ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                        <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                    </svg>
                    Status
                </button>
                <button className={`tab ${activeTab === 'sheets' ? 'active' : ''}`} onClick={() => setActiveTab('sheets')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    Google Sheets
                </button>
                <button className={`tab ${activeTab === 'mysql' ? 'active' : ''}`} onClick={() => setActiveTab('mysql')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                    MySQL
                </button>
            </nav>

            {/* Main Content */}
            <main className="main">
                {error && <div className="error-banner">{error}</div>}

                {!currentConnection ? (
                    <div className="no-connection">
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                            <h2>No Connection Selected</h2>
                            <p>Create a new connection or select an existing one to get started.</p>
                            <button className="btn btn-primary" onClick={() => setShowNewConnModal(true)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Create Connection
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Status Tab */}
                        {activeTab === 'status' && (
                            <section className="tab-content active">
                                {/* Status Cards */}
                                <section className="status-cards">
                                    <div className="card status-card">
                                        <div className="card-icon sync-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                                                <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                                            </svg>
                                        </div>
                                        <div className="card-content">
                                            <h3>Sync Status</h3>
                                            <p className="card-value">{syncStatus?.state || 'Idle'}</p>
                                        </div>
                                    </div>
                                    <div className="card status-card">
                                        <div className="card-icon queue-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                <line x1="3" y1="9" x2="21" y2="9" />
                                                <line x1="9" y1="21" x2="9" y2="9" />
                                            </svg>
                                        </div>
                                        <div className="card-content">
                                            <h3>Pending Changes</h3>
                                            <p className="card-value">{syncStatus?.pendingChanges || 0}</p>
                                        </div>
                                    </div>
                                    <div className="card status-card">
                                        <div className="card-icon conflict-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                <line x1="12" y1="9" x2="12" y2="13" />
                                                <line x1="12" y1="17" x2="12.01" y2="17" />
                                            </svg>
                                        </div>
                                        <div className="card-content">
                                            <h3>Conflicts</h3>
                                            <p className="card-value">{syncStatus?.conflicts || 0}</p>
                                        </div>
                                    </div>
                                    <div className="card status-card">
                                        <div className="card-icon time-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <polyline points="12 6 12 12 16 14" />
                                            </svg>
                                        </div>
                                        <div className="card-content">
                                            <h3>Last Sync</h3>
                                            <p className="card-value">{syncStatus?.lastSync || 'Never'}</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Actions */}
                                <section className="actions-section">
                                    <h2>Actions</h2>
                                    <div className="actions">
                                        <button className="btn btn-primary" onClick={handleTriggerSync}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M23 4v6h-6" />
                                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                            </svg>
                                            Trigger Full Sync
                                        </button>
                                        <button className="btn btn-secondary" onClick={loadSyncStatus}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="1 4 1 10 7 10" />
                                                <polyline points="23 20 23 14 17 14" />
                                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                                            </svg>
                                            Refresh Status
                                        </button>
                                        <button className="btn btn-danger" onClick={handleDeleteConnection}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                            Delete Connection
                                        </button>
                                    </div>
                                </section>

                                {/* Event Log */}
                                <section className="log-section">
                                    <div className="log-header">
                                        <h2>Event Log</h2>
                                        <button className="btn btn-ghost" onClick={() => setEventLog([])}>Clear</button>
                                    </div>
                                    <div className="log-container">
                                        {eventLog.length === 0 ? (
                                            <div className="log-empty"><p>Waiting for events...</p></div>
                                        ) : (
                                            eventLog.map((entry, i) => (
                                                <div key={i} className="log-entry">
                                                    <span className="log-time">{entry.time}</span>
                                                    <span className={`log-type ${entry.type}`}>{entry.type.toUpperCase()}</span>
                                                    <span className="log-message">{entry.message}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>
                            </section>
                        )}

                        {/* Sheets Tab */}
                        {activeTab === 'sheets' && (
                            <section className="tab-content active">
                                <div className="data-header">
                                    <h2>Google Sheets Data</h2>
                                    <div className="data-actions">
                                        <button className="btn btn-secondary" onClick={loadSheetsData}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="23 4 23 10 17 10" />
                                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                            </svg>
                                            Refresh
                                        </button>
                                    </div>
                                </div>
                                <div className="data-table-container">
                                    {!sheetsData ? (
                                        <div className="loading">Loading data...</div>
                                    ) : sheetsData.rows.length === 0 ? (
                                        <div className="table-empty">
                                            <p>No sheet data found.</p>
                                            <small className="text-muted">No sheet added or sheet is empty.</small>
                                        </div>
                                    ) : (
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    {sheetsData.headers.map((h) => <th key={h}>{h}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sheetsData.rows.map((row, i) => (
                                                    <tr key={i}>
                                                        {sheetsData.headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* MySQL Tab */}
                        {activeTab === 'mysql' && (
                            <section className="tab-content active">
                                <div className="data-header">
                                    <h2>MySQL Data</h2>
                                    <div className="data-actions">
                                        <button className="btn btn-secondary" onClick={loadMySQLData}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="23 4 23 10 17 10" />
                                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                            </svg>
                                            Refresh
                                        </button>
                                    </div>
                                </div>
                                <div className="data-table-container">
                                    {!mysqlData ? (
                                        <div className="loading">Loading data...</div>
                                    ) : mysqlData.rows.length === 0 ? (
                                        <div className="table-empty">
                                            <p>No MySQL data found.</p>
                                            <small className="text-muted">Table is empty or not yet synced.</small>
                                        </div>
                                    ) : (
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    {mysqlData.columns.map((c) => <th key={c}>{c}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mysqlData.rows.map((row, i) => (
                                                    <tr key={i}>
                                                        {mysqlData.columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>

            {/* New Connection Modal */}
            {showNewConnModal && (
                <NewConnectionModal
                    onClose={() => setShowNewConnModal(false)}
                    onCreate={handleCreateConnection}
                />
            )}
        </div>
    );
}

// New Connection Modal Component
function NewConnectionModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
    const [name, setName] = useState('');
    const [spreadsheetId, setSpreadsheetId] = useState('');
    const [sheetName, setSheetName] = useState('Sheet1');
    const [mysqlTableName, setMysqlTableName] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        await onCreate({
            name,
            spreadsheetId,
            sheetName,
            mysqlTableName,
            columnMapping: {}, // Will be auto-inferred by backend
        });

        setLoading(false);
    };

    return (
        <div className="modal active" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Create New Connection</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form className="modal-body" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="connName">Connection Name</label>
                        <input
                            type="text"
                            id="connName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="e.g., Q1 Sales Data"
                            className="form-control"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="connSheetId">Google Sheet ID</label>
                        <input
                            type="text"
                            id="connSheetId"
                            value={spreadsheetId}
                            onChange={(e) => setSpreadsheetId(e.target.value)}
                            required
                            placeholder="From Sheet URL: docs.google.com/spreadsheets/d/{ID}/..."
                            className="form-control"
                        />
                        <small>Paste the ID from your Google Sheet URL</small>
                    </div>
                    <div className="form-group">
                        <label htmlFor="connSheetName">Sheet Name (Tab)</label>
                        <input
                            type="text"
                            id="connSheetName"
                            value={sheetName}
                            onChange={(e) => setSheetName(e.target.value)}
                            required
                            placeholder="Sheet1"
                            className="form-control"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="connTableName">MySQL Table Name</label>
                        <input
                            type="text"
                            id="connTableName"
                            value={mysqlTableName}
                            onChange={(e) => setMysqlTableName(e.target.value)}
                            required
                            placeholder="e.g., sales_data (auto-created)"
                            pattern="[a-zA-Z0-9_]+"
                            className="form-control"
                        />
                        <small>A new table will be created automatically</small>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Connection'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
