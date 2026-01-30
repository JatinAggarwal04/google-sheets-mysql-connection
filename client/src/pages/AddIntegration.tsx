// ===========================================
// Add Integration Page (Wizard)
// ===========================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Sheet,
    Database,
    Link2,
    Settings,
    Loader2,
    AlertCircle,
    Plus,
} from 'lucide-react';
import './AddIntegration.css';
import { GoogleDisclaimerModal } from '../components/GoogleDisclaimerModal';

type Step = 'google' | 'mysql' | 'sheet' | 'mapping' | 'review';

interface GoogleConnection {
    id: string;
    email: string;
}

interface MySQLConnection {
    id: string;
    name: string;
    host: string;
    database: string;
}

interface Spreadsheet {
    id: string;
    name: string;
}

interface SheetInfo {
    sheetId: number;
    title: string;
}

interface ColumnMapping {
    sheetColumn: string;
    mysqlColumn: string;
    dataType: string;
    isPrimaryKey: boolean;
}

export function AddIntegrationPage() {
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>('google');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 1: Google Connection
    const [googleConnections, setGoogleConnections] = useState<GoogleConnection[]>([]);
    const [selectedGoogleConnection, setSelectedGoogleConnection] = useState<string | null>(null);
    const [showGoogleDisclaimer, setShowGoogleDisclaimer] = useState(false);

    // Step 2: MySQL Connection
    const [mysqlConnections, setMysqlConnections] = useState<MySQLConnection[]>([]);
    const [selectedMysqlConnection, setSelectedMysqlConnection] = useState<string | null>(null);
    const [showNewMysqlForm, setShowNewMysqlForm] = useState(false);
    const [newMysqlForm, setNewMysqlForm] = useState({
        name: '',
        host: '',
        port: 3306,
        database: '',
        username: '',
        password: '',
    });

    // Step 3: Sheet Selection
    const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<string | null>(null);
    const [sheets, setSheets] = useState<SheetInfo[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
    // const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
    const [mysqlTables, setMysqlTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [createNewTable, setCreateNewTable] = useState(false);
    const [newTableName, setNewTableName] = useState('');

    // Step 4: Mapping
    const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
    const [syncDirection, setSyncDirection] = useState<'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional'>('bidirectional');
    const [initialSyncSource, setInitialSyncSource] = useState<'sheets' | 'mysql'>('sheets');

    // Step 5: Review
    const [integrationName, setIntegrationName] = useState('');

    const steps: { key: Step; label: string; icon: any }[] = [
        { key: 'google', label: 'Google Account', icon: Sheet },
        { key: 'mysql', label: 'MySQL Database', icon: Database },
        { key: 'sheet', label: 'Select Sheet', icon: Link2 },
        { key: 'mapping', label: 'Column Mapping', icon: Settings },
        { key: 'review', label: 'Review', icon: Check },
    ];

    const currentStepIndex = steps.findIndex(s => s.key === step);

    useEffect(() => {
        loadGoogleConnections();
        loadMysqlConnections();
    }, []);

    const loadGoogleConnections = async () => {
        try {
            const data = await api.google.listConnections();
            setGoogleConnections(data);
        } catch (err) {
            console.error('Failed to load Google connections:', err);
        }
    };

    const loadMysqlConnections = async () => {
        try {
            const data = await api.mysql.listConnections();
            setMysqlConnections(data);
        } catch (err) {
            console.error('Failed to load MySQL connections:', err);
        }
    };

    const handleConnectGoogle = () => {
        setShowGoogleDisclaimer(true);
    };

    const proceedWithGoogleConnect = async () => {
        try {
            setShowGoogleDisclaimer(false);
            const { authUrl } = await api.auth.getGoogleAuthUrl();

            const popup = window.open(
                authUrl,
                'Google Auth',
                `width=600,height=700,left=${window.screen.width / 2 - 300},top=${window.screen.height / 2 - 350}`
            );

            if (!popup) {
                setError('Popup blocked! Please allow popups for this site.');
                return;
            }

            // Message listener
            const messageHandler = async (event: MessageEvent) => {
                if (event.origin !== window.location.origin) return;

                if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(checkClosedInterval);
                    await loadGoogleConnections();
                } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(checkClosedInterval);
                    setError(event.data.error || 'Google connection failed');
                }
            };

            window.addEventListener('message', messageHandler);

            // Check if window closed
            const checkClosedInterval = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosedInterval);
                    window.removeEventListener('message', messageHandler);
                    loadGoogleConnections();
                }
            }, 1000);


        } catch (err) {
            setError('Failed to initiate Google connection');
        }
    };

    const handleCreateMysqlConnection = async () => {
        try {
            setLoading(true);
            setError(null);

            // Test connection first
            const testResult = await api.mysql.testConnection(newMysqlForm);

            if (!testResult.connected) {
                setError('Could not connect to MySQL database. Please check your credentials.');
                return;
            }

            // Create connection
            await api.mysql.createConnection(newMysqlForm);
            await loadMysqlConnections();
            setShowNewMysqlForm(false);
            setNewMysqlForm({
                name: '',
                host: '',
                port: 3306,
                database: '',
                username: '',
                password: '',
            });
        } catch (err) {
            setError('Failed to create MySQL connection');
        } finally {
            setLoading(false);
        }
    };

    const loadSpreadsheets = async () => {
        if (!selectedGoogleConnection) return;

        try {
            setLoading(true);
            const data = await api.google.listSpreadsheets(selectedGoogleConnection);
            setSpreadsheets(data);
        } catch (err) {
            setError('Failed to load spreadsheets');
        } finally {
            setLoading(false);
        }
    };

    const loadSheets = async (spreadsheetId: string) => {
        if (!selectedGoogleConnection) return;

        try {
            setLoading(true);
            const info = await api.google.getSpreadsheetInfo(selectedGoogleConnection, spreadsheetId);
            setSheets(info.sheets);
        } catch (err) {
            setError('Failed to load sheets');
        } finally {
            setLoading(false);
        }
    };

    const loadSheetHeaders = async () => {
        if (!selectedGoogleConnection || !selectedSpreadsheet || !selectedSheet) return;

        try {
            setLoading(true);
            const data = await api.google.getSheetData(selectedGoogleConnection, selectedSpreadsheet, selectedSheet);
            // setSheetHeaders(data.headers);

            // Auto-generate initial mappings
            const initialMappings: ColumnMapping[] = data.headers.map((header, index) => ({
                sheetColumn: header,
                mysqlColumn: header.toLowerCase().replace(/\s+/g, '_'),
                dataType: 'VARCHAR(255)',
                isPrimaryKey: index === 0,
            }));
            setColumnMappings(initialMappings);
        } catch (err) {
            setError('Failed to load sheet data');
        } finally {
            setLoading(false);
        }
    };

    const loadMysqlTables = async (connectionId?: string) => {
        const id = connectionId || selectedMysqlConnection;
        if (!id) return;

        try {
            const tables = await api.mysql.listTables(id);
            setMysqlTables(tables);
        } catch (err) {
            console.error('Failed to load tables:', err);
        }
    };

    const handleNext = async () => {
        setError(null);

        switch (step) {
            case 'google':
                if (!selectedGoogleConnection) {
                    setError('Please select a Google account');
                    return;
                }
                setStep('mysql');
                break;

            case 'mysql':
                if (!selectedMysqlConnection) {
                    setError('Please select a MySQL connection');
                    return;
                }
                if (createNewTable && !newTableName.trim()) {
                    setError('Please enter a new table name');
                    return;
                }
                if (!createNewTable && !selectedTable) {
                    setError('Please select a target table');
                    return;
                }
                await loadSpreadsheets();
                setStep('sheet');
                break;

            case 'sheet':
                if (!selectedSpreadsheet || !selectedSheet) {
                    setError('Please select a spreadsheet and sheet');
                    return;
                }
                await loadSheetHeaders();
                setStep('mapping');
                break;

            case 'mapping':
                const hasPrimaryKey = columnMappings.some(m => m.isPrimaryKey);
                if (!hasPrimaryKey) {
                    setError('Please select a primary key column');
                    return;
                }
                const targetTable = createNewTable ? newTableName : selectedTable;
                if (syncDirection === 'mysql_to_sheets') {
                    setIntegrationName(`${targetTable} → ${selectedSheet}`);
                } else if (syncDirection === 'bidirectional') {
                    setIntegrationName(`${selectedSheet} ↔ ${targetTable}`);
                } else {
                    setIntegrationName(`${selectedSheet} → ${targetTable}`);
                }
                setStep('review');
                break;

            case 'review':
                await handleCreateIntegration();
                break;
        }
    };

    const handleBack = () => {
        const idx = currentStepIndex;
        if (idx > 0) {
            setStep(steps[idx - 1].key);
        }
    };

    const handleCreateIntegration = async () => {
        try {
            if (createNewTable && !newTableName.trim()) {
                setError('Please enter a new table name');
                return;
            }
            if (!createNewTable && !selectedTable) {
                setError('Please select a target table');
                return;
            }

            setLoading(true);
            setError(null);

            const payload = {
                name: integrationName,
                googleConnectionId: selectedGoogleConnection!,
                mysqlConnectionId: selectedMysqlConnection!,
                spreadsheetId: selectedSpreadsheet!,
                sheetName: selectedSheet!,
                tableName: createNewTable ? newTableName : selectedTable!,
                createNewTable,
                syncDirection,
                initialSyncSource: syncDirection === 'bidirectional' ? initialSyncSource : undefined,
                columnMappings: columnMappings.map(m => ({
                    sheetColumn: m.sheetColumn,
                    mysqlColumn: m.mysqlColumn,
                    dataType: m.dataType,
                    isPrimaryKey: m.isPrimaryKey,
                })),
                conflictResolution: 'latest_wins',
            };
            console.log('Sending payload:', payload);

            await api.integrations.create(payload);

            navigate('/dashboard');
        } catch (err) {
            setError('Failed to create integration');
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (step) {
            case 'google':
                return (
                    <div className="step-content">
                        <h2>Connect Your Google Account</h2>
                        <p>Select a connected Google account or connect a new one</p>

                        <div className="connection-list">
                            {googleConnections.map(conn => (
                                <button
                                    key={conn.id}
                                    className={`connection-option ${selectedGoogleConnection === conn.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedGoogleConnection(conn.id)}
                                >
                                    <div className="connection-icon google">
                                        <Sheet size={20} />
                                    </div>
                                    <div className="connection-info">
                                        <span className="connection-name">{conn.email}</span>
                                        <span className="connection-type">Google Account</span>
                                    </div>
                                    {selectedGoogleConnection === conn.id && (
                                        <Check size={20} className="connection-check" />
                                    )}
                                </button>
                            ))}

                            <button className="connection-option add-new" onClick={handleConnectGoogle}>
                                <div className="connection-icon">
                                    <Plus size={20} />
                                </div>
                                <div className="connection-info">
                                    <span className="connection-name">Connect New Account</span>
                                    <span className="connection-type">Add Google account via OAuth</span>
                                </div>
                            </button>
                        </div>
                    </div>
                );

            case 'mysql':
                return (
                    <div className="step-content">
                        <h2>Connect Your MySQL Database</h2>
                        <p>Select an existing connection or add a new database</p>

                        {!showNewMysqlForm ? (
                            <div className="connection-list-container">
                                <div className="connection-list">
                                    {mysqlConnections.map(conn => (
                                        <button
                                            key={conn.id}
                                            className={`connection-option ${selectedMysqlConnection === conn.id ? 'selected' : ''}`}
                                            onClick={() => {
                                                setSelectedMysqlConnection(conn.id);
                                                loadMysqlTables(conn.id);
                                            }}
                                        >
                                            <div className="connection-icon mysql">
                                                <Database size={20} />
                                            </div>
                                            <div className="connection-info">
                                                <span className="connection-name">{conn.name}</span>
                                                <span className="connection-type">{conn.host}/{conn.database}</span>
                                            </div>
                                            {selectedMysqlConnection === conn.id && (
                                                <Check size={20} className="connection-check" />
                                            )}
                                        </button>
                                    ))}

                                    <button className="connection-option add-new" onClick={() => setShowNewMysqlForm(true)}>
                                        <div className="connection-icon">
                                            <Plus size={20} />
                                        </div>
                                        <div className="connection-info">
                                            <span className="connection-name">Add New Connection</span>
                                            <span className="connection-type">Connect to a MySQL database</span>
                                        </div>
                                    </button>
                                </div>

                                {selectedMysqlConnection && (
                                    <div className="selection-panel" style={{ marginTop: 'var(--space-6)' }}>
                                        <h3><Database size={18} /> Select Target Table</h3>

                                        <div className="form-group">
                                            <label className="toggle-option">
                                                <input
                                                    type="checkbox"
                                                    checked={createNewTable}
                                                    onChange={e => setCreateNewTable(e.target.checked)}
                                                />
                                                <span>Create new table</span>
                                            </label>
                                        </div>

                                        {createNewTable ? (
                                            <div className="form-group">
                                                <label className="form-label">New Table Name</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="my_table"
                                                    value={newTableName}
                                                    onChange={e => setNewTableName(e.target.value)}
                                                />
                                            </div>
                                        ) : (
                                            <div className="form-group">
                                                <label className="form-label">Existing Table</label>
                                                <select
                                                    className="form-input form-select"
                                                    value={selectedTable || ''}
                                                    onChange={e => setSelectedTable(e.target.value)}
                                                >
                                                    <option value="">Select table...</option>
                                                    {mysqlTables.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mysql-form card">
                                <h3>New MySQL Connection</h3>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Connection Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="My Database"
                                            value={newMysqlForm.name}
                                            onChange={e => setNewMysqlForm({ ...newMysqlForm, name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Host</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="localhost"
                                            value={newMysqlForm.host}
                                            onChange={e => setNewMysqlForm({ ...newMysqlForm, host: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group" style={{ maxWidth: 120 }}>
                                        <label className="form-label">Port</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="3306"
                                            value={newMysqlForm.port}
                                            onChange={e => setNewMysqlForm({ ...newMysqlForm, port: parseInt(e.target.value) })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Database</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="my_database"
                                        value={newMysqlForm.database}
                                        onChange={e => setNewMysqlForm({ ...newMysqlForm, database: e.target.value })}
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Username</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="root"
                                            value={newMysqlForm.username}
                                            onChange={e => setNewMysqlForm({ ...newMysqlForm, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="••••••••"
                                            value={newMysqlForm.password}
                                            onChange={e => setNewMysqlForm({ ...newMysqlForm, password: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-actions">
                                    <button className="btn btn-ghost" onClick={() => setShowNewMysqlForm(false)}>
                                        Cancel
                                    </button>
                                    <button className="btn btn-primary" onClick={handleCreateMysqlConnection} disabled={loading}>
                                        {loading ? <Loader2 size={18} className="spin" /> : 'Create Connection'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );

            case 'sheet':
                return (
                    <div className="step-content">
                        <h2>Select Google Sheet</h2>
                        <p>Choose the spreadsheet and sheet to sync</p>

                        <div className="selection-panel">
                            <h3><Sheet size={18} /> Google Sheet Selection</h3>

                            <div className="form-group">
                                <label className="form-label">Spreadsheet</label>
                                <select
                                    className="form-input form-select"
                                    value={selectedSpreadsheet || ''}
                                    onChange={e => {
                                        setSelectedSpreadsheet(e.target.value);
                                        setSelectedSheet(null);
                                        if (e.target.value) loadSheets(e.target.value);
                                    }}
                                >
                                    <option value="">Select spreadsheet...</option>
                                    {spreadsheets.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedSpreadsheet && (
                                <div className="form-group">
                                    <label className="form-label">Sheet</label>
                                    <select
                                        className="form-input form-select"
                                        value={selectedSheet || ''}
                                        onChange={e => setSelectedSheet(e.target.value)}
                                    >
                                        <option value="">Select sheet...</option>
                                        {sheets.map(s => (
                                            <option key={s.sheetId} value={s.title}>{s.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'mapping':
                return (
                    <div className="step-content">
                        <h2>Configure Column Mapping</h2>
                        <p>Map sheet columns to MySQL columns and set data types</p>

                        <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                            <label className="form-label">Sync Direction</label>
                            <div className="radio-group">
                                <label className="radio-option">
                                    <input
                                        type="radio"
                                        name="syncDirection"
                                        value="sheets_to_mysql"
                                        checked={syncDirection === 'sheets_to_mysql'}
                                        onChange={() => setSyncDirection('sheets_to_mysql')}
                                    />
                                    <span>Sheets → MySQL (one-way)</span>
                                </label>
                                <label className="radio-option">
                                    <input
                                        type="radio"
                                        name="syncDirection"
                                        value="mysql_to_sheets"
                                        checked={syncDirection === 'mysql_to_sheets'}
                                        onChange={() => setSyncDirection('mysql_to_sheets')}
                                    />
                                    <span>MySQL → Sheets (one-way)</span>
                                </label>
                                <label className="radio-option">
                                    <input
                                        type="radio"
                                        name="syncDirection"
                                        value="bidirectional"
                                        checked={syncDirection === 'bidirectional'}
                                        onChange={() => setSyncDirection('bidirectional')}
                                    />
                                    <span>Bidirectional ⇄</span>
                                </label>
                            </div>
                        </div>

                        {syncDirection === 'bidirectional' && (
                            <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                                <label className="form-label">Initial Data Source</label>
                                <p className="text-sm text-secondary mb-2">Which data should be used to populate the other side initially?</p>
                                <div className="radio-group">
                                    <label className="radio-option">
                                        <input
                                            type="radio"
                                            name="initialSyncSource"
                                            value="sheets"
                                            checked={initialSyncSource === 'sheets'}
                                            onChange={() => setInitialSyncSource('sheets')}
                                        />
                                        <span>Google Sheets (overwrite Database)</span>
                                    </label>
                                    <label className="radio-option">
                                        <input
                                            type="radio"
                                            name="initialSyncSource"
                                            value="mysql"
                                            checked={initialSyncSource === 'mysql'}
                                            onChange={() => setInitialSyncSource('mysql')}
                                        />
                                        <span>MySQL (overwrite Sheet)</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="mapping-table-container">
                            <table className="table mapping-table">
                                <thead>
                                    <tr>
                                        <th>Primary Key</th>
                                        <th>Sheet Column</th>
                                        <th>MySQL Column</th>
                                        <th>Data Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {columnMappings.map((mapping, index) => (
                                        <tr key={index}>
                                            <td>
                                                <input
                                                    type="radio"
                                                    name="primaryKey"
                                                    checked={mapping.isPrimaryKey}
                                                    onChange={() => {
                                                        setColumnMappings(columnMappings.map((m, i) => ({
                                                            ...m,
                                                            isPrimaryKey: i === index,
                                                        })));
                                                    }}
                                                />
                                            </td>
                                            <td>{mapping.sheetColumn}</td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={mapping.mysqlColumn}
                                                    onChange={e => {
                                                        const newMappings = [...columnMappings];
                                                        newMappings[index].mysqlColumn = e.target.value;
                                                        setColumnMappings(newMappings);
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    className="form-input form-select"
                                                    value={mapping.dataType}
                                                    onChange={e => {
                                                        const newMappings = [...columnMappings];
                                                        newMappings[index].dataType = e.target.value;
                                                        setColumnMappings(newMappings);
                                                    }}
                                                >
                                                    <option value="VARCHAR(255)">VARCHAR(255)</option>
                                                    <option value="TEXT">TEXT</option>
                                                    <option value="INT">INT</option>
                                                    <option value="BIGINT">BIGINT</option>
                                                    <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
                                                    <option value="BOOLEAN">BOOLEAN</option>
                                                    <option value="DATE">DATE</option>
                                                    <option value="DATETIME">DATETIME</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );

            case 'review':
                return (
                    <div className="step-content">
                        <h2>Review & Create Integration</h2>
                        <p>Verify your configuration before creating the integration</p>

                        <div className="form-group">
                            <label className="form-label">Integration Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={integrationName}
                                onChange={e => setIntegrationName(e.target.value)}
                            />
                        </div>

                        <div className="review-card">
                            <h3>Configuration Summary</h3>

                            <div className="review-item">
                                <span className="review-label">Google Account:</span>
                                <span className="review-value">
                                    {googleConnections.find(c => c.id === selectedGoogleConnection)?.email}
                                </span>
                            </div>

                            <div className="review-item">
                                <span className="review-label">Spreadsheet/Sheet:</span>
                                <span className="review-value">
                                    {spreadsheets.find(s => s.id === selectedSpreadsheet)?.name} / {selectedSheet}
                                </span>
                            </div>

                            <div className="review-item">
                                <span className="review-label">MySQL Connection:</span>
                                <span className="review-value">
                                    {mysqlConnections.find(c => c.id === selectedMysqlConnection)?.name}
                                </span>
                            </div>

                            <div className="review-item">
                                <span className="review-label">Target Table:</span>
                                <span className="review-value">
                                    {createNewTable ? `${newTableName} (new)` : selectedTable}
                                </span>
                            </div>

                            <div className="review-item">
                                <span className="review-label">Sync Direction:</span>
                                <span className="review-value">
                                    {syncDirection === 'bidirectional' ? 'Bidirectional ⇄' :
                                        syncDirection === 'sheets_to_mysql' ? 'Sheets → MySQL' : 'MySQL → Sheets'}
                                </span>
                            </div>

                            {syncDirection === 'bidirectional' && (
                                <div className="review-item">
                                    <span className="review-label">Initial Data Source:</span>
                                    <span className="review-value">
                                        {initialSyncSource === 'sheets' ? 'Google Sheets' : 'MySQL Database'}
                                    </span>
                                </div>
                            )}

                            <div className="review-item">
                                <span className="review-label">Columns:</span>
                                <span className="review-value">{columnMappings.length} mapped</span>
                            </div>
                        </div>

                        <div className="review-notice">
                            <AlertCircle size={18} />
                            <span>An initial sync will start automatically after creation</span>
                        </div>
                    </div >
                );
        }
    };

    return (
        <div className="add-integration">
            <GoogleDisclaimerModal
                isOpen={showGoogleDisclaimer}
                onClose={() => setShowGoogleDisclaimer(false)}
                onConfirm={proceedWithGoogleConnect}
            />
            {/* Progress Steps */}
            <div className="wizard-progress">
                {steps.map((s, index) => (
                    <div
                        key={s.key}
                        className={`wizard-step ${step === s.key ? 'active' : ''} ${index < currentStepIndex ? 'completed' : ''}`}
                    >
                        <div className="wizard-step-icon">
                            {index < currentStepIndex ? <Check size={18} /> : <s.icon size={18} />}
                        </div>
                        <span className="wizard-step-label">{s.label}</span>
                        {index < steps.length - 1 && <div className="wizard-step-line" />}
                    </div>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="wizard-error">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {/* Step Content */}
            <div className="wizard-content">
                {renderStepContent()}
            </div>

            {/* Navigation */}
            <div className="wizard-nav">
                <button
                    className="btn btn-ghost"
                    onClick={handleBack}
                    disabled={currentStepIndex === 0}
                >
                    <ArrowLeft size={18} />
                    Back
                </button>

                <button
                    className="btn btn-primary"
                    onClick={handleNext}
                    disabled={loading}
                >
                    {loading ? (
                        <Loader2 size={18} className="spin" />
                    ) : step === 'review' ? (
                        <>
                            Create Integration
                            <Check size={18} />
                        </>
                    ) : (
                        <>
                            Continue
                            <ArrowRight size={18} />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
