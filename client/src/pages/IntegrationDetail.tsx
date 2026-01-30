// ===========================================
// Integration Detail Page
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { DataTableView } from '../components/DataTableView';
import { ConfirmModal } from '../components/ConfirmModal';
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
    ArrowLeftRight,
    Zap,
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
    google_connection_id: string;
    mysql_connection_id: string;
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

    // Table data state
    const [sheetData, setSheetData] = useState<{ headers: string[]; rows: Record<string, unknown>[] }>({ headers: [], rows: [] });
    const [mysqlData, setMysqlData] = useState<{ columns: string[]; rows: Record<string, unknown>[] }>({ columns: [], rows: [] });
    const [loadingSheetData, setLoadingSheetData] = useState(false);
    const [loadingMysqlData, setLoadingMysqlData] = useState(false);

    // Delete state
    const [showDeleteIntegrationConfirm, setShowDeleteIntegrationConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

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

    // Load Google Sheets data
    const loadSheetData = useCallback(async () => {
        if (!integration) return;
        setLoadingSheetData(true);
        try {
            const data = await api.google.getSheetData(
                integration.google_connection_id,
                integration.spreadsheet_id,
                integration.sheet_name
            );
            setSheetData(data);
        } catch (err) {
            console.error('Failed to load sheet data:', err);
        } finally {
            setLoadingSheetData(false);
        }
    }, [integration]);

    // Load MySQL data
    const loadMysqlData = useCallback(async () => {
        if (!integration) return;
        setLoadingMysqlData(true);
        try {
            const data = await api.mysql.getTableData(
                integration.mysql_connection_id,
                integration.table_name
            );
            setMysqlData(data);
        } catch (err) {
            console.error('Failed to load MySQL data:', err);
        } finally {
            setLoadingMysqlData(false);
        }
    }, [integration]);

    // Load table data when integration is loaded
    useEffect(() => {
        if (integration) {
            loadSheetData();
            loadMysqlData();
        }
    }, [integration, loadSheetData, loadMysqlData]);

    // Get primary key column from mappings
    const getPrimaryKeyColumn = useCallback(() => {
        const pkMapping = mappings.find(m => m.is_primary_key);
        return pkMapping?.mysql_column || null;
    }, [mappings]);

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

    const handleSync = async () => {
        try {
            await api.integrations.sync(id!);
            await loadLogs();
            // Start polling for sync completion
            pollForSyncCompletion();
        } catch (err) {
            setError('Failed to trigger sync');
        }
    };

    // Handle sync triggered from data table edits
    const handleSyncAndRefresh = async () => {
        try {
            await api.integrations.sync(id!);
            // Start polling for sync completion and data refresh
            pollForSyncCompletion();
        } catch (err) {
            console.error('Auto-sync failed:', err);
        }
    };

    // Poll for sync completion and auto-refresh data
    const pollForSyncCompletion = () => {
        let pollCount = 0;
        const maxPolls = 30; // Poll for up to 30 seconds

        const pollInterval = setInterval(async () => {
            pollCount++;
            try {
                const newLogs = await api.integrations.getLogs(id!);
                setLogs(newLogs);

                // Check if the latest sync is completed
                if (newLogs.length > 0) {
                    const latestLog = newLogs[0];
                    if (latestLog.status === 'completed' || latestLog.status === 'failed') {
                        clearInterval(pollInterval);
                        // Refresh both table data after sync completes
                        loadSheetData();
                        loadMysqlData();
                        loadIntegration(); // Refresh last_sync_at
                    }
                }

                if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                }
            } catch (err) {
                clearInterval(pollInterval);
            }
        }, 1000);
    };

    const handleDelete = async () => {
        try {
            setIsDeleting(true);
            await api.integrations.delete(id!);
            navigate('/dashboard');
        } catch (err) {
            setError('Failed to delete integration');
            setIsDeleting(false); // Only reset if failed
        } finally {
            if (!isDeleting) {
                setShowDeleteIntegrationConfirm(false);
            }
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
                <div className="header-top">
                    <div className="header-left">
                        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
                            <ArrowLeft size={18} />
                            Back
                        </button>
                        <h1>{integration.name}</h1>
                        {getStatusBadge(integration.status)}
                    </div>
                </div>

                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => { loadIntegration(); loadLogs(); }}>
                        <RefreshCw size={18} />
                        Refresh
                    </button>
                    <button className="btn btn-primary" onClick={handleSync}>
                        <Zap size={18} />
                        Sync Now
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
                    <button className="btn btn-danger" onClick={() => setShowDeleteIntegrationConfirm(true)}>
                        <Trash2 size={18} />
                        Delete
                    </button>
                </div>
            </div>

            {/* Overview */}
            <div className="detail-section">
                <h2>Overview</h2>
                <div className="overview-grid">
                    {integration.sync_direction === 'mysql_to_sheets' ? (
                        <>
                            <div className="overview-card">
                                <div className="overview-icon mysql">
                                    <Database size={24} />
                                </div>
                                <div className="overview-content">
                                    <span className="overview-label">Source Table</span>
                                    <span className="overview-value">{integration.table_name}</span>
                                </div>
                            </div>

                            <div className="overview-arrow">
                                <ArrowRight size={24} />
                            </div>

                            <div className="overview-card">
                                <div className="overview-icon">
                                    <Sheet size={24} />
                                </div>
                                <div className="overview-content">
                                    <span className="overview-label">Target Sheet</span>
                                    <span className="overview-value">{integration.sheet_name}</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="overview-card">
                                <div className="overview-icon">
                                    <Sheet size={24} />
                                </div>
                                <div className="overview-content">
                                    <span className="overview-label">{integration.sync_direction === 'bidirectional' ? 'Sheet' : 'Source Sheet'}</span>
                                    <span className="overview-value">{integration.sheet_name}</span>
                                </div>
                            </div>

                            <div className="overview-arrow">
                                {integration.sync_direction === 'bidirectional' ? (
                                    <ArrowLeftRight size={24} />
                                ) : (
                                    <ArrowRight size={24} />
                                )}
                            </div>

                            <div className="overview-card">
                                <div className="overview-icon mysql">
                                    <Database size={24} />
                                </div>
                                <div className="overview-content">
                                    <span className="overview-label">{integration.sync_direction === 'bidirectional' ? 'Table' : 'Target Table'}</span>
                                    <span className="overview-value">{integration.table_name}</span>
                                </div>
                            </div>
                        </>
                    )}
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

            {/* Data Tables Section */}
            <div className="detail-section data-tables-section">
                <h2>Table Data</h2>
                <p className="data-tables-info">View and edit data in both tables. Changes are automatically synced after each edit.</p>

                <div className="data-tables-grid">
                    {/* Google Sheets Data */}
                    <DataTableView
                        title={`Sheet: ${integration.sheet_name}`}
                        icon={<Sheet size={20} />}
                        headers={sheetData.headers}
                        rows={sheetData.rows}
                        loading={loadingSheetData}
                        onRefresh={loadSheetData}
                        onAddRow={async (row) => {
                            await api.google.insertRow(
                                integration.google_connection_id,
                                integration.spreadsheet_id,
                                integration.sheet_name,
                                sheetData.headers,
                                row
                            );
                        }}
                        onUpdateRow={async (rowIndex, row) => {
                            // rowIndex is 0-based in our data, but sheets API uses 1-based (2 = first data row)
                            await api.google.updateRow(
                                integration.google_connection_id,
                                integration.spreadsheet_id,
                                integration.sheet_name,
                                rowIndex + 2, // Add 2: +1 for header row, +1 for 0-indexing
                                sheetData.headers,
                                row
                            );
                        }}
                        onDeleteRow={async (rowIndex) => {
                            await api.google.deleteRow(
                                integration.google_connection_id,
                                integration.spreadsheet_id,
                                integration.sheet_name,
                                rowIndex + 2 // Add 2: +1 for header row, +1 for 0-indexing
                            );
                        }}
                        onSync={handleSyncAndRefresh}
                    />

                    {/* MySQL Data */}
                    <DataTableView
                        title={`Table: ${integration.table_name}`}
                        icon={<Database size={20} />}
                        headers={mysqlData.columns}
                        rows={mysqlData.rows}
                        primaryKeyColumn={getPrimaryKeyColumn() || undefined}
                        loading={loadingMysqlData}
                        onRefresh={loadMysqlData}
                        onAddRow={async (row) => {
                            await api.mysql.insertRow(
                                integration.mysql_connection_id,
                                integration.table_name,
                                row
                            );
                        }}
                        onUpdateRow={async (rowIndex, row) => {
                            const pkColumn = getPrimaryKeyColumn();
                            if (!pkColumn) {
                                throw new Error('No primary key defined for this table');
                            }
                            const pkValue = String(mysqlData.rows[rowIndex][pkColumn]);
                            await api.mysql.updateRow(
                                integration.mysql_connection_id,
                                integration.table_name,
                                pkColumn,
                                pkValue,
                                row
                            );
                        }}
                        onDeleteRow={async (_rowIndex, row) => {
                            const pkColumn = getPrimaryKeyColumn();
                            if (!pkColumn) {
                                throw new Error('No primary key defined for this table');
                            }
                            const pkValue = String(row[pkColumn]);
                            await api.mysql.deleteRow(
                                integration.mysql_connection_id,
                                integration.table_name,
                                pkColumn,
                                pkValue
                            );
                        }}
                        onSync={handleSyncAndRefresh}
                    />
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

            {/* Delete Integration Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteIntegrationConfirm}
                title="Delete Integration"
                message="Are you sure you want to delete this integration? This action cannot be undone."
                confirmLabel="Delete"
                isDestructive={true}
                isLoading={isDeleting}
                onConfirm={handleDelete}
                onClose={() => !isDeleting && setShowDeleteIntegrationConfirm(false)}
            />
        </div>
    );
}
