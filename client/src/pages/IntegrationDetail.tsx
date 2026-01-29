// ===========================================
// Integration Detail Page
// ===========================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
    ArrowLeft,
    Play,
    Pause,
    Trash2,
    RefreshCw,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    Sheet,
    Database,
    ArrowRight,
} from 'lucide-react';
import './IntegrationDetail.css';

interface Integration {
    id: string;
    name: string;
    spreadsheet_id: string;
    sheet_name: string;
    table_name: string;
    sync_direction: string;
    status: string;
    last_sync_at: string | null;
}

interface ColumnMapping {
    id: string;
    sheet_column: string;
    mysql_column: string;
    data_type: string;
    is_primary_key: boolean;
}

interface SyncLog {
    id: string;
    status: string;
    direction: string;
    rows_processed: number;
    rows_inserted: number;
    rows_updated: number;
    rows_deleted: number;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
}

export function IntegrationDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [integration, setIntegration] = useState<Integration | null>(null);
    const [mappings, setMappings] = useState<ColumnMapping[]>([]);
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadIntegration();
        loadLogs();
    }, [id]);

    const loadIntegration = async () => {
        try {
            setLoading(true);
            const data = await api.integrations.get(id!);
            setIntegration(data.integration);
            setMappings(data.mappings);
        } catch (err) {
            setError('Failed to load integration');
        } finally {
            setLoading(false);
        }
    };

    const loadLogs = async () => {
        try {
            const data = await api.integrations.getLogs(id!);
            setLogs(data);
        } catch (err) {
            console.error('Failed to load logs:', err);
        }
    };

    const handlePause = async () => {
        try {
            await api.integrations.pause(id!);
            await loadIntegration();
        } catch (err) {
            setError('Failed to pause integration');
        }
    };

    const handleResume = async () => {
        try {
            await api.integrations.resume(id!);
            await loadIntegration();
        } catch (err) {
            setError('Failed to resume integration');
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this integration?')) return;

        try {
            await api.integrations.delete(id!);
            navigate('/dashboard');
        } catch (err) {
            setError('Failed to delete integration');
        }
    };

    const formatDate = (date: string | null) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    const getStatusBadge = (status: string) => {
        const config = {
            active: { class: 'badge-success', icon: CheckCircle },
            paused: { class: 'badge-warning', icon: Pause },
            error: { class: 'badge-error', icon: AlertCircle },
            pending: { class: 'badge-info', icon: Clock },
        }[status] || { class: 'badge-neutral', icon: Clock };

        return (
            <span className={`badge ${config.class}`}>
                <config.icon size={14} />
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    const getLogStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle size={16} className="log-icon success" />;
            case 'failed':
                return <XCircle size={16} className="log-icon error" />;
            default:
                return <Clock size={16} className="log-icon pending" />;
        }
    };

    if (loading) {
        return (
            <div className="loading-state" style={{ minHeight: '60vh' }}>
                <div className="spinner" />
                <p>Loading integration...</p>
            </div>
        );
    }

    if (error || !integration) {
        return (
            <div className="error-state">
                <AlertCircle size={48} />
                <h3>Failed to load integration</h3>
                <p>{error}</p>
                <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="integration-detail">
            {/* Header */}
            <div className="detail-header">
                <div className="header-left">
                    <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft size={18} />
                        Back
                    </button>
                    <h1>{integration.name}</h1>
                    {getStatusBadge(integration.status)}
                </div>

                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => { loadIntegration(); loadLogs(); }}>
                        <RefreshCw size={18} />
                        Refresh
                    </button>
                    {integration.status === 'active' ? (
                        <button className="btn btn-secondary" onClick={handlePause}>
                            <Pause size={18} />
                            Pause
                        </button>
                    ) : integration.status === 'paused' ? (
                        <button className="btn btn-primary" onClick={handleResume}>
                            <Play size={18} />
                            Resume
                        </button>
                    ) : null}
                    <button className="btn btn-danger" onClick={handleDelete}>
                        <Trash2 size={18} />
                        Delete
                    </button>
                </div>
            </div>

            {/* Overview */}
            <div className="detail-section">
                <h2>Overview</h2>
                <div className="overview-grid">
                    <div className="overview-card">
                        <div className="overview-icon">
                            <Sheet size={24} />
                        </div>
                        <div className="overview-content">
                            <span className="overview-label">Source Sheet</span>
                            <span className="overview-value">{integration.sheet_name}</span>
                        </div>
                    </div>

                    <div className="overview-arrow">
                        <ArrowRight size={24} />
                    </div>

                    <div className="overview-card">
                        <div className="overview-icon mysql">
                            <Database size={24} />
                        </div>
                        <div className="overview-content">
                            <span className="overview-label">Target Table</span>
                            <span className="overview-value">{integration.table_name}</span>
                        </div>
                    </div>
                </div>

                <div className="overview-meta">
                    <div className="meta-item">
                        <span className="meta-label">Sync Direction:</span>
                        <span className="meta-value">
                            {integration.sync_direction === 'sheets_to_mysql' ? 'Sheets → MySQL' :
                                integration.sync_direction === 'mysql_to_sheets' ? 'MySQL → Sheets' :
                                    'Bidirectional'}
                        </span>
                    </div>
                    <div className="meta-item">
                        <span className="meta-label">Last Sync:</span>
                        <span className="meta-value">{formatDate(integration.last_sync_at)}</span>
                    </div>
                </div>
            </div>

            {/* Column Mappings */}
            <div className="detail-section">
                <h2>Column Mappings</h2>
                <div className="mappings-card">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Sheet Column</th>
                                <th>MySQL Column</th>
                                <th>Data Type</th>
                                <th>Primary Key</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mappings.map(mapping => (
                                <tr key={mapping.id}>
                                    <td>{mapping.sheet_column}</td>
                                    <td><code>{mapping.mysql_column}</code></td>
                                    <td><span className="badge badge-neutral">{mapping.data_type}</span></td>
                                    <td>{mapping.is_primary_key && <CheckCircle size={16} className="pk-icon" />}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sync Logs */}
            <div className="detail-section">
                <h2>Sync History</h2>
                {logs.length === 0 ? (
                    <div className="no-logs">
                        <Clock size={24} />
                        <p>No sync history yet</p>
                    </div>
                ) : (
                    <div className="logs-card">
                        <table className="table logs-table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Direction</th>
                                    <th>Processed</th>
                                    <th>Inserted</th>
                                    <th>Updated</th>
                                    <th>Deleted</th>
                                    <th>Started</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td>
                                            <div className="log-status">
                                                {getLogStatusIcon(log.status)}
                                                <span>{log.status}</span>
                                            </div>
                                        </td>
                                        <td>
                                            {log.direction === 'sheets_to_mysql' ? '→ MySQL' : '→ Sheets'}
                                        </td>
                                        <td>{log.rows_processed}</td>
                                        <td className="count-insert">{log.rows_inserted}</td>
                                        <td className="count-update">{log.rows_updated}</td>
                                        <td className="count-delete">{log.rows_deleted}</td>
                                        <td>{new Date(log.started_at).toLocaleString()}</td>
                                        <td>
                                            {log.completed_at
                                                ? `${Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s`
                                                : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
