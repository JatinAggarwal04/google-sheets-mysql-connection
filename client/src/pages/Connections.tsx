// ===========================================
// Connections Page
// ===========================================

import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
    Sheet,
    Database,
    Plus,
    Trash2,
    CheckCircle,
    AlertCircle,
} from 'lucide-react';
import { GoogleDisclaimerModal } from '../components/GoogleDisclaimerModal';
import { ConfirmModal } from '../components/ConfirmModal';
import './Connections.css';

interface GoogleConnection {
    id: string;
    email: string;
    isValid: boolean;
    createdAt: string;
}

interface MySQLConnection {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    isValid: boolean;
    createdAt: string;
}

export function ConnectionsPage() {
    const [googleConnections, setGoogleConnections] = useState<GoogleConnection[]>([]);
    const [mysqlConnections, setMysqlConnections] = useState<MySQLConnection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showMysqlForm, setShowMysqlForm] = useState(false);
    const [mysqlForm, setMysqlForm] = useState({
        name: '',
        host: '',
        port: 3306,
        database: '',
        username: '',
        password: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [showGoogleDisclaimer, setShowGoogleDisclaimer] = useState(false);

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        type: 'google' | 'mysql' | null;
        id: string | null;
        loading: boolean;
    }>({
        isOpen: false,
        type: null,
        id: null,
        loading: false,
    });
    const [connectLoading, setConnectLoading] = useState(false);

    useEffect(() => {
        loadConnections();
    }, []);

    const loadConnections = async () => {
        try {
            setLoading(true);
            const [google, mysql] = await Promise.all([
                api.google.listConnections(),
                api.mysql.listConnections(),
            ]);
            setGoogleConnections(google);
            setMysqlConnections(mysql);
        } catch (err) {
            setError('Failed to load connections');
        } finally {
            setLoading(false);
        }
    };

    const handleConnectGoogle = async () => {
        setShowGoogleDisclaimer(true);
    };

    const proceedWithGoogleConnect = async () => {
        try {
            setShowGoogleDisclaimer(false);
            setConnectLoading(true);
            const { authUrl } = await api.auth.getGoogleAuthUrl();
            const width = 600;
            const height = 700;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;

            const popup = window.open(
                authUrl,
                'Google Auth',
                `width=${width},height=${height},left=${left},top=${top}`
            );

            if (!popup) {
                setError('Popup blocked! Please allow popups for this site.');
                setConnectLoading(false);
                return;
            }

            // Message listener
            const messageHandler = async (event: MessageEvent) => {
                if (event.origin !== window.location.origin) return;

                if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(checkClosedInterval);
                    await loadConnections();
                    setConnectLoading(false);
                } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(checkClosedInterval);
                    setError(event.data.error || 'Google connection failed');
                    setConnectLoading(false);
                }
            };

            window.addEventListener('message', messageHandler);

            // Check if window closed without success
            const checkClosedInterval = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosedInterval);
                    window.removeEventListener('message', messageHandler);
                    // If we're still loading, it means we didn't get a success/error message
                    // but the window closed.
                    loadConnections();
                    setConnectLoading(false);
                }
            }, 1000);

        } catch (err: any) {
            setError(err.message || 'Failed to initiate Google connection');
            setConnectLoading(false);
        }
    };

    const initiateDeleteGoogle = (id: string) => {
        setDeleteModal({ isOpen: true, type: 'google', id, loading: false });
    };

    const initiateDeleteMysql = (id: string) => {
        setDeleteModal({ isOpen: true, type: 'mysql', id, loading: false });
    };

    const handleConfirmDelete = async () => {
        if (!deleteModal.id || !deleteModal.type) return;

        setDeleteModal(prev => ({ ...prev, loading: true }));
        try {
            if (deleteModal.type === 'google') {
                await api.google.deleteConnection(deleteModal.id);
            } else {
                await api.mysql.deleteConnection(deleteModal.id);
            }
            await loadConnections();
            setDeleteModal({ isOpen: false, type: null, id: null, loading: false });
        } catch (err: any) {
            console.error('Delete error:', err);
            const message = err.response?.data?.error?.message || err.response?.data?.error || err.message || 'Failed to delete connection';
            setError(message);
            setDeleteModal(prev => ({ ...prev, isOpen: false, loading: false })); // Close modal on error to show global error
        }
    };

    const handleCreateMysqlConnection = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setFormLoading(true);
            setError(null);

            // Test first
            const test = await api.mysql.testConnection(mysqlForm);
            if (!test.connected) {
                setError('Could not connect to database. Check your credentials.');
                return;
            }

            await api.mysql.createConnection(mysqlForm);
            await loadConnections();
            setShowMysqlForm(false);
            setMysqlForm({
                name: '',
                host: '',
                port: 3306,
                database: '',
                username: '',
                password: '',
            });
        } catch (err) {
            setError('Failed to create connection');
        } finally {
            setFormLoading(false);
        }
    };

    return (
        <div className="connections-page">
            <GoogleDisclaimerModal
                isOpen={showGoogleDisclaimer}
                onClose={() => setShowGoogleDisclaimer(false)}
                onConfirm={proceedWithGoogleConnect}
            />

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={deleteModal.type === 'google' ? 'Disconnect Google Account' : 'Delete Database Connection'}
                message={deleteModal.type === 'google'
                    ? 'Are you sure you want to disconnect this Google account? Any active integrations using this account will stop working.'
                    : 'Are you sure you want to delete this database connection? Any active integrations using this database will stop working.'}
                confirmLabel="Delete"
                isDestructive={true}
                isLoading={deleteModal.loading}
                onClose={() => setDeleteModal({ isOpen: false, type: null, id: null, loading: false })}
                onConfirm={handleConfirmDelete}
            />

            <div className="page-header">
                <h1>Connections</h1>
                <p>Manage your Google and MySQL connections</p>
            </div>

            {error && (
                <div className="page-error">
                    <AlertCircle size={18} />
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="connections-grid">
                {/* Google Connections */}
                <div className="connections-section">
                    <div className="section-header">
                        <h2><Sheet size={20} /> Google Accounts</h2>
                        <button className="btn btn-outline btn-sm" onClick={handleConnectGoogle} disabled={connectLoading}>
                            {connectLoading ? <div className="spinner-sm" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} /> : <Plus size={16} />}
                            {connectLoading ? ' Connecting...' : 'Connect'}
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                        </div>
                    ) : googleConnections.length === 0 ? (
                        <div className="empty-connections">
                            <p>No Google accounts connected</p>
                            <button className="btn btn-primary" onClick={handleConnectGoogle} disabled={connectLoading}>
                                {connectLoading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : <Plus size={18} />}
                                {connectLoading ? ' Connecting...' : ' Connect Google Account'}
                            </button>
                        </div>
                    ) : (
                        <div className="connection-cards">
                            {googleConnections.map(conn => (
                                <div key={conn.id} className="connection-card">
                                    <div className="connection-card-icon google">
                                        <Sheet size={24} />
                                    </div>
                                    <div className="connection-card-content">
                                        <div className="connection-card-header">
                                            <span className="connection-card-name">{conn.email}</span>
                                            {conn.isValid ? (
                                                <CheckCircle size={16} className="status-valid" />
                                            ) : (
                                                <AlertCircle size={16} className="status-invalid" />
                                            )}
                                        </div>
                                        <span className="connection-card-meta">
                                            Connected {new Date(conn.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <button
                                        className="btn btn-ghost btn-icon btn-danger-text"
                                        onClick={() => initiateDeleteGoogle(conn.id)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* MySQL Connections */}
                <div className="connections-section">
                    <div className="section-header">
                        <h2><Database size={20} /> MySQL Databases</h2>
                        <button className="btn btn-outline btn-sm" onClick={() => setShowMysqlForm(true)}>
                            <Plus size={16} />
                            Add
                        </button>
                    </div>

                    {showMysqlForm && (
                        <div className="mysql-form-card card">
                            <h3>New MySQL Connection</h3>
                            <form onSubmit={handleCreateMysqlConnection}>
                                <div className="form-group">
                                    <label className="form-label">Connection Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="My Database"
                                        value={mysqlForm.name}
                                        onChange={e => setMysqlForm({ ...mysqlForm, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Host</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="localhost"
                                            value={mysqlForm.host}
                                            onChange={e => setMysqlForm({ ...mysqlForm, host: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group" style={{ maxWidth: 100 }}>
                                        <label className="form-label">Port</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={mysqlForm.port}
                                            onChange={e => setMysqlForm({ ...mysqlForm, port: parseInt(e.target.value) })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Database</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="my_database"
                                        value={mysqlForm.database}
                                        onChange={e => setMysqlForm({ ...mysqlForm, database: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Username</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="root"
                                            value={mysqlForm.username}
                                            onChange={e => setMysqlForm({ ...mysqlForm, username: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="••••••••"
                                            value={mysqlForm.password}
                                            onChange={e => setMysqlForm({ ...mysqlForm, password: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => setShowMysqlForm(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                        {formLoading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : 'Create'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                        </div>
                    ) : mysqlConnections.length === 0 && !showMysqlForm ? (
                        <div className="empty-connections">
                            <p>No MySQL databases connected</p>
                            <button className="btn btn-primary" onClick={() => setShowMysqlForm(true)}>
                                <Plus size={18} />
                                Add MySQL Database
                            </button>
                        </div>
                    ) : (
                        <div className="connection-cards">
                            {mysqlConnections.map(conn => (
                                <div key={conn.id} className="connection-card">
                                    <div className="connection-card-icon mysql">
                                        <Database size={24} />
                                    </div>
                                    <div className="connection-card-content">
                                        <div className="connection-card-header">
                                            <span className="connection-card-name">{conn.name}</span>
                                            {conn.isValid ? (
                                                <CheckCircle size={16} className="status-valid" />
                                            ) : (
                                                <AlertCircle size={16} className="status-invalid" />
                                            )}
                                        </div>
                                        <span className="connection-card-meta">
                                            {conn.host}:{conn.port}/{conn.database}
                                        </span>
                                    </div>
                                    <button
                                        className="btn btn-ghost btn-icon btn-danger-text"
                                        onClick={() => initiateDeleteMysql(conn.id)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
