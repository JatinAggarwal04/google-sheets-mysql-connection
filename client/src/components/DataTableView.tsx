// ===========================================
// Data Table View Component
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Trash2,
    Edit2,
    Check,
    X,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import './DataTableView.css';

interface DataTableViewProps {
    title: string;
    icon: React.ReactNode;
    headers: string[];
    rows: Record<string, unknown>[];
    primaryKeyColumn?: string;
    loading?: boolean;
    onRefresh: () => Promise<void>;
    onAddRow: (row: Record<string, unknown>) => Promise<void>;
    onUpdateRow: (rowIndex: number, row: Record<string, unknown>) => Promise<void>;
    onDeleteRow: (rowIndex: number, row: Record<string, unknown>) => Promise<void>;
    onSync?: () => Promise<void>;
}

interface ValidationError {
    message: string;
    emptyFields: string[];
}

export function DataTableView({
    title,
    icon,
    headers,
    rows,
    primaryKeyColumn,
    loading = false,
    onRefresh,
    onAddRow,
    onUpdateRow,
    onDeleteRow,
    onSync,
}: DataTableViewProps) {
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [editingData, setEditingData] = useState<Record<string, unknown>>({});
    const [addingRow, setAddingRow] = useState(false);
    const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});
    const [error, setError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const [savingRow, setSavingRow] = useState(false);
    const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
    const [syncing, setSyncing] = useState(false);

    // Initialize new row with empty values for all headers
    useEffect(() => {
        if (addingRow) {
            const emptyRow: Record<string, unknown> = {};
            headers.forEach(h => { emptyRow[h] = ''; });
            setNewRowData(emptyRow);
        }
    }, [addingRow, headers]);

    const validateRow = (row: Record<string, unknown>): ValidationError | null => {
        const emptyFields: string[] = [];
        for (const [key, value] of Object.entries(row)) {
            if (value === null || value === undefined || value === '') {
                emptyFields.push(key);
            }
        }
        if (emptyFields.length > 0) {
            return {
                message: `Please fill in all fields. Empty: ${emptyFields.join(', ')}`,
                emptyFields,
            };
        }
        return null;
    };

    // Auto-sync helper
    const triggerAutoSync = useCallback(async () => {
        if (onSync) {
            setSyncing(true);
            try {
                await onSync();
            } catch (err) {
                console.error('Auto-sync failed:', err);
            } finally {
                setSyncing(false);
            }
        }
    }, [onSync]);

    const handleStartEdit = useCallback((rowIndex: number) => {
        setEditingRowIndex(rowIndex);
        setEditingData({ ...rows[rowIndex] });
        setValidationError(null);
        setError(null);
    }, [rows]);

    const handleCancelEdit = useCallback(() => {
        setEditingRowIndex(null);
        setEditingData({});
        setValidationError(null);
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (editingRowIndex === null) return;

        const validation = validateRow(editingData);
        if (validation) {
            setValidationError(validation);
            return;
        }

        setSavingRow(true);
        try {
            await onUpdateRow(editingRowIndex, editingData);
            setEditingRowIndex(null);
            setEditingData({});
            setValidationError(null);
            await onRefresh();
            await triggerAutoSync();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save row');
        } finally {
            setSavingRow(false);
        }
    }, [editingRowIndex, editingData, onUpdateRow, onRefresh, triggerAutoSync]);

    const handleStartAddRow = useCallback(() => {
        setAddingRow(true);
        setValidationError(null);
        setError(null);
    }, []);

    const handleCancelAddRow = useCallback(() => {
        setAddingRow(false);
        setNewRowData({});
        setValidationError(null);
    }, []);

    const handleSaveNewRow = useCallback(async () => {
        const validation = validateRow(newRowData);
        if (validation) {
            setValidationError(validation);
            return;
        }

        setSavingRow(true);
        try {
            await onAddRow(newRowData);
            setAddingRow(false);
            setNewRowData({});
            setValidationError(null);
            await onRefresh();
            await triggerAutoSync();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add row');
        } finally {
            setSavingRow(false);
        }
    }, [newRowData, onAddRow, onRefresh, triggerAutoSync]);

    const handleDeleteClick = useCallback((rowIndex: number) => {
        setDeleteConfirmIndex(rowIndex);
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        if (deleteConfirmIndex === null) return;

        try {
            await onDeleteRow(deleteConfirmIndex, rows[deleteConfirmIndex]);
            await onRefresh();
            await triggerAutoSync();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete row');
        } finally {
            setDeleteConfirmIndex(null);
        }
    }, [deleteConfirmIndex, rows, onDeleteRow, onRefresh, triggerAutoSync]);

    const handleDeleteCancel = useCallback(() => {
        setDeleteConfirmIndex(null);
    }, []);

    const handleEditFieldChange = useCallback((field: string, value: string) => {
        setEditingData(prev => ({ ...prev, [field]: value }));
        // Clear validation error for this field
        if (validationError?.emptyFields.includes(field) && value !== '') {
            setValidationError(prev => {
                if (!prev) return null;
                const newEmptyFields = prev.emptyFields.filter(f => f !== field);
                if (newEmptyFields.length === 0) return null;
                return {
                    ...prev,
                    emptyFields: newEmptyFields,
                    message: `Please fill in all fields. Empty: ${newEmptyFields.join(', ')}`,
                };
            });
        }
    }, [validationError]);

    const handleNewRowFieldChange = useCallback((field: string, value: string) => {
        setNewRowData(prev => ({ ...prev, [field]: value }));
        // Clear validation error for this field
        if (validationError?.emptyFields.includes(field) && value !== '') {
            setValidationError(prev => {
                if (!prev) return null;
                const newEmptyFields = prev.emptyFields.filter(f => f !== field);
                if (newEmptyFields.length === 0) return null;
                return {
                    ...prev,
                    emptyFields: newEmptyFields,
                    message: `Please fill in all fields. Empty: ${newEmptyFields.join(', ')}`,
                };
            });
        }
    }, [validationError]);

    const formatCellValue = (value: unknown): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div className="data-table-view">
            <div className="data-table-header">
                <div className="data-table-title">
                    {icon}
                    <h3>{title}</h3>
                    <span className="row-count">{rows.length} rows</span>
                </div>
                <div className="data-table-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        <RefreshCw size={14} className={loading ? 'spinning' : ''} />
                        Refresh
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleStartAddRow}
                        disabled={addingRow || editingRowIndex !== null}
                    >
                        <Plus size={14} />
                        Add Row
                    </button>
                </div>
            </div>

            <div className="null-warning">
                <AlertCircle size={16} />
                <span>All fields must have values. Empty/null values are not allowed.</span>
            </div>

            {error && (
                <div className="data-table-error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {validationError && (
                <div className="data-table-validation-error">
                    <AlertCircle size={16} />
                    <span>{validationError.message}</span>
                </div>
            )}

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            {headers.map(header => (
                                <th key={header} className={header === primaryKeyColumn ? 'primary-key' : ''}>
                                    {header}
                                    {header === primaryKeyColumn && <span className="pk-badge">PK</span>}
                                </th>
                            ))}
                            <th className="actions-column">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Add new row form */}
                        {addingRow && (
                            <tr className="adding-row">
                                {headers.map(header => (
                                    <td key={header} className={validationError?.emptyFields.includes(header) ? 'has-error' : ''}>
                                        <input
                                            type="text"
                                            value={formatCellValue(newRowData[header])}
                                            onChange={(e) => handleNewRowFieldChange(header, e.target.value)}
                                            placeholder={header}
                                            disabled={savingRow}
                                        />
                                    </td>
                                ))}
                                <td className="actions-cell">
                                    <button
                                        className="action-btn save"
                                        onClick={handleSaveNewRow}
                                        disabled={savingRow}
                                        title="Save"
                                    >
                                        <Check size={16} />
                                    </button>
                                    <button
                                        className="action-btn cancel"
                                        onClick={handleCancelAddRow}
                                        disabled={savingRow}
                                        title="Cancel"
                                    >
                                        <X size={16} />
                                    </button>
                                </td>
                            </tr>
                        )}

                        {/* Existing rows */}
                        {rows.map((row, index) => (
                            <tr key={index} className={editingRowIndex === index ? 'editing-row' : ''}>
                                {headers.map(header => (
                                    <td key={header} className={editingRowIndex === index && validationError?.emptyFields.includes(header) ? 'has-error' : ''}>
                                        {editingRowIndex === index ? (
                                            <input
                                                type="text"
                                                value={formatCellValue(editingData[header])}
                                                onChange={(e) => handleEditFieldChange(header, e.target.value)}
                                                disabled={savingRow}
                                            />
                                        ) : (
                                            <span className="cell-value">{formatCellValue(row[header])}</span>
                                        )}
                                    </td>
                                ))}
                                <td className="actions-cell">
                                    {editingRowIndex === index ? (
                                        <>
                                            <button
                                                className="action-btn save"
                                                onClick={handleSaveEdit}
                                                disabled={savingRow}
                                                title="Save"
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button
                                                className="action-btn cancel"
                                                onClick={handleCancelEdit}
                                                disabled={savingRow}
                                                title="Cancel"
                                            >
                                                <X size={16} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="action-btn edit"
                                                onClick={() => handleStartEdit(index)}
                                                disabled={addingRow || editingRowIndex !== null}
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                className="action-btn delete"
                                                onClick={() => handleDeleteClick(index)}
                                                disabled={addingRow || editingRowIndex !== null}
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}

                        {rows.length === 0 && !addingRow && (
                            <tr className="empty-row">
                                <td colSpan={headers.length + 1}>
                                    No data. Click "Add Row" to add your first entry.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {(loading || syncing) && (
                <div className="data-table-loading">
                    <div className="spinner-small" />
                    <span>{syncing ? 'Syncing...' : 'Loading...'}</span>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmIndex !== null && (
                <div className="delete-confirm-overlay">
                    <div className="delete-confirm-modal">
                        <h4>Confirm Delete</h4>
                        <p>Are you sure you want to delete this row?</p>
                        <div className="delete-confirm-actions">
                            <button className="btn btn-secondary" onClick={handleDeleteCancel}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
