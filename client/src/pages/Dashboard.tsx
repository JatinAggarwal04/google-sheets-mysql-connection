// ===========================================
// Dashboard Page
// ===========================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
    Plus,
    RefreshCw,
    Pause,
    Play,
    Trash2,
    ExternalLink,
    Activity,
    Database,
    Sheet,
    AlertCircle,
    CheckCircle,
    Clock,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import './Dashboard.css';

interface Integration {
    id: string;
    name: string;
    spreadsheet_id: string;
    sheet_name: string;
    table_name: string;
    sync_direction: string;
    status: string;
    last_sync_at: string | null;
    created_at: string;
}

export function DashboardPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        id: string | null;
        loading: boolean;
    }>({
        isOpen: false,
        id: null,
        loading: false
    });

    useEffect(() => {
        loadIntegrations();
    }, []);

    const loadIntegrations = async () => {
        try {
            setLoading(true);
            const data = await api.integrations.list();
            setIntegrations(data);
            setError(null);
        } catch (err) {
            setError('Failed to load integrations');
        } finally {
            setLoading(false);
        }
    };

    const handlePause = async (id: string) => {
        try {
            await api.integrations.pause(id);
            await loadIntegrations();
        } catch (err) {
            setError('Failed to pause integration');
        }
    };

    const handleResume = async (id: string) => {
        try {
            await api.integrations.resume(id);
            await loadIntegrations();
        } catch (err) {
            setError('Failed to resume integration');
        }
    };

    const initiateDelete = (id: string) => {
        setDeleteModal({ isOpen: true, id, loading: false });
    };

    const handleConfirmDelete = async () => {
        if (!deleteModal.id) return;

        setDeleteModal(prev => ({ ...prev, loading: true }));
        try {
            await api.integrations.delete(deleteModal.id);
            await loadIntegrations();
            setDeleteModal({ isOpen: false, id: null, loading: false });
        } catch (err) {
            setError('Failed to delete integration');
            setDeleteModal(prev => ({ ...prev, isOpen: false, loading: false }));
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active':
                return <CheckCircle size={16} className="status-icon status-icon-active" />;
            case 'paused':
                return <Pause size={16} className="status-icon status-icon-paused" />;
            case 'error':
                return <AlertCircle size={16} className="status-icon status-icon-error" />;
            default:
                return <Clock size={16} className="status-icon status-icon-pending" />;
        }
    };

    const getStatusBadge = (status: string) => {
        const className = {
            active: 'badge-success',
            paused: 'badge-warning',
            error: 'badge-error',
            pending: 'badge-info',
        }[status] || 'badge-neutral';

        return (
            <span className={`badge ${className}`}>
                {getStatusIcon(status)}
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    const getSyncDirectionLabel = (direction: string) => {
        return {
            sheets_to_mysql: 'Sheets → MySQL',
            mysql_to_sheets: 'MySQL → Sheets',
            bidirectional: 'Bidirectional ⇄',
        }[direction] || direction;
    };

    const formatDate = (date: string | null) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Manage your Google Sheets ↔ MySQL integrations</p>
                </div>
                <div className="dashboard-actions">
                    <button className="btn btn-secondary" onClick={loadIntegrations}>
                        <RefreshCw size={18} />
                        Refresh
                    </button>
                    <Link to="/integrations/new" className="btn btn-primary">
                        <Plus size={18} />
                        Add Integration
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="dashboard-stats">
                <div className="stat-card">
                    <div className="stat-icon stat-icon-primary">
                        <Activity size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{integrations.filter(i => i.status === 'active').length}</span>
                        <span className="stat-label">Active</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon stat-icon-warning">
                        <Pause size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{integrations.filter(i => i.status === 'paused').length}</span>
                        <span className="stat-label">Paused</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon stat-icon-error">
                        <AlertCircle size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{integrations.filter(i => i.status === 'error').length}</span>
                        <span className="stat-label">Errors</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon stat-icon-info">
                        <Database size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{integrations.length}</span>
                        <span className="stat-label">Total</span>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="dashboard-error">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {/* Integrations List */}
            <div className="integrations-section">
                <h2>Integrations</h2>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading integrations...</p>
                    </div>
                ) : integrations.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Sheet size={48} />
                        </div>
                        <h3>No integrations yet</h3>
                        <p>Create your first integration to sync data between Google Sheets and MySQL</p>
                        <Link to="/integrations/new" className="btn btn-primary">
                            <Plus size={18} />
                            Create Integration
                        </Link>
                    </div>
                ) : (
                    <div className="integrations-grid">
                        {integrations.map((integration) => (
                            <div key={integration.id} className="integration-card">
                                <div className="integration-card-header">
                                    <h3 className="integration-name">{integration.name}</h3>
                                    {getStatusBadge(integration.status)}
                                </div>

                                <div className="integration-details">
                                    <div className="integration-detail">
                                        <Sheet size={16} />
                                        <span>{integration.sheet_name}</span>
                                    </div>
                                    <div className="integration-detail">
                                        <Database size={16} />
                                        <span>{integration.table_name}</span>
                                    </div>
                                    <div className="integration-detail sync-direction">
                                        <RefreshCw size={16} />
                                        <span>{getSyncDirectionLabel(integration.sync_direction)}</span>
                                    </div>
                                </div>

                                <div className="integration-meta">
                                    <span className="last-sync">
                                        Last sync: {formatDate(integration.last_sync_at)}
                                    </span>
                                </div>

                                <div className="integration-actions">
                                    <Link
                                        to={`/integrations/${integration.id}`}
                                        className="btn btn-outline btn-sm"
                                    >
                                        <ExternalLink size={14} />
                                        Details
                                    </Link>

                                    {integration.status === 'active' ? (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handlePause(integration.id)}
                                        >
                                            <Pause size={14} />
                                            Pause
                                        </button>
                                    ) : integration.status === 'paused' ? (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleResume(integration.id)}
                                        >
                                            <Play size={14} />
                                            Resume
                                        </button>
                                    ) : null}

                                    <button
                                        className="btn btn-ghost btn-sm btn-danger-text"
                                        onClick={() => initiateDelete(integration.id)}
                                    >
                                        <Trash2 size={14} />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title="Delete Integration"
                message="Are you sure you want to delete this integration? This action cannot be undone and will stop all future syncs."
                confirmLabel="Delete"
                isDestructive={true}
                isLoading={deleteModal.loading}
                onClose={() => setDeleteModal({ isOpen: false, id: null, loading: false })}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}
