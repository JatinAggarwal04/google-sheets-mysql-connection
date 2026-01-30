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

    const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);
    const [isMysqlSelecting, setIsMysqlSelecting] = useState(false);
    const [isSheetEmpty, setIsSheetEmpty] = useState(false);
    const [isTableEmpty, setIsTableEmpty] = useState(false);
    const [checkingEmptyStatus, setCheckingEmptyStatus] = useState(false);

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
            setIsGoogleConnecting(true);
            setShowGoogleDisclaimer(false);
            const { authUrl } = await api.auth.getGoogleAuthUrl();

            const popup = window.open(
                authUrl,
                'Google Auth',
                `width=600,height=700,left=${window.screen.width / 2 - 300},top=${window.screen.height / 2 - 350}`
            );

            if (!popup) {
                setError('Popup blocked! Please allow popups for this site.');
                setIsGoogleConnecting(false);
                return;
            }

            // Message listener
            const messageHandler = async (event: MessageEvent) => {
                if (event.origin !== window.location.origin) return;

                if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(checkClosedInterval);
                    await loadGoogleConnections();
                    setIsGoogleConnecting(false);
                } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(checkClosedInterval);
                    setError(event.data.error || 'Google connection failed');
                    setIsGoogleConnecting(false);
                }
            };

            window.addEventListener('message', messageHandler);

            // Check if window closed
            const checkClosedInterval = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosedInterval);
                    window.removeEventListener('message', messageHandler);
                    // If we didn't get success/error yet, assume user closed it
                    setIsGoogleConnecting(false);
                    loadGoogleConnections();
                }
            }, 1000);

        } catch (err) {
            setError('Failed to initiate Google connection');
            setIsGoogleConnecting(false);
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

    const [mysqlSchema, setMysqlSchema] = useState<Array<{ column: string; type: string; key: string }>>([]);

    // Helper to map MySQL types to generic types
    const mapMysqlTypeToGeneric = (mysqlType: string): string => {
        const type = mysqlType.toLowerCase();
        if (type.includes('int') && !type.includes('bigint')) return 'INT';
        if (type.includes('bigint')) return 'BIGINT';
        if (type.includes('varchar')) return 'VARCHAR(255)';
        if (type.includes('text')) return 'TEXT';
        if (type.includes('decimal') || type.includes('float') || type.includes('double')) return 'DECIMAL(10,2)';
        if (type.includes('bool') || type.includes('tinyint')) return 'BOOLEAN';
        if (type.includes('datetime') || type.includes('timestamp')) return 'DATETIME';
        if (type.includes('date')) return 'DATE';
        return 'VARCHAR(255)';
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

            // Only auto-map if using Sheets as source or if just loading data
            // We'll return the headers for use in generateMappings
            return data.headers;
        } catch (err) {
            setError('Failed to load sheet data');
            return [];
        } finally {
            setLoading(false);
        }
    };

    const loadMysqlSchema = async () => {
        if (!selectedMysqlConnection) return;
        const tableName = createNewTable ? newTableName : selectedTable;
        if (!tableName) return;

        try {
            // If creating new table, we don't have schema yet
            if (createNewTable) return [];

            const schema = await api.mysql.getTableSchema(selectedMysqlConnection, tableName);
            setMysqlSchema(schema);
            return schema;
        } catch (err) {
            console.error('Failed to load MySQL schema:', err);
            return [];
        }
    };

    const generateMappings = (sourceProp?: 'sheets' | 'mysql', headersProp?: string[], schemaProp?: any[]) => {
        const source = sourceProp || initialSyncSource;

        // Logic for MySQL source
        if (source === 'mysql' && !createNewTable) {
            const schema = schemaProp || mysqlSchema;
            if (!schema || schema.length === 0) return;

            const mappings: ColumnMapping[] = schema.map(col => ({
                sheetColumn: col.column, // Default sheet col name to DB col name
                mysqlColumn: col.column,
                dataType: mapMysqlTypeToGeneric(col.type),
                isPrimaryKey: col.key === 'PRI',
            }));
            setColumnMappings(mappings);
        }
        // Logic for Sheets source
        else {
            // Need headers
            // We can't easily get headers here effectively without passing them or storing them
            // Let's rely on passed headers if available
            if (headersProp) {
                const mappings: ColumnMapping[] = headersProp.map((header, index) => ({
                    sheetColumn: header,
                    mysqlColumn: header.toLowerCase().replace(/\s+/g, '_'),
                    dataType: 'VARCHAR(255)',
                    isPrimaryKey: index === 0,
                }));
                setColumnMappings(mappings);
            }
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

    // Check if sheet is empty when selected
    useEffect(() => {
        const checkSheet = async () => {
            if (!selectedGoogleConnection || !selectedSpreadsheet || !selectedSheet) {
                setIsSheetEmpty(false);
                return;
            }
            try {
                setCheckingEmptyStatus(true);
                const { isEmpty } = await api.google.isSheetEmpty(selectedGoogleConnection, selectedSpreadsheet, selectedSheet);
                setIsSheetEmpty(isEmpty);
            } catch (err) {
                console.error('Failed to check sheet status:', err);
            } finally {
                setCheckingEmptyStatus(false);
            }
        };
        checkSheet();
    }, [selectedGoogleConnection, selectedSpreadsheet, selectedSheet]);

    // Check if table is empty when selected
    useEffect(() => {
        const checkTable = async () => {
            if (!selectedMysqlConnection || (!selectedTable && !createNewTable)) {
                setIsTableEmpty(false);
                return;
            }

            if (createNewTable) {
                setIsTableEmpty(true); // New table is always empty
                return;
            }

            if (selectedTable) {
                try {
                    setCheckingEmptyStatus(true);
                    const { isEmpty } = await api.mysql.isTableEmpty(selectedMysqlConnection, selectedTable);
                    setIsTableEmpty(isEmpty);
                } catch (err) {
                    console.error('Failed to check table status:', err);
                } finally {
                    setCheckingEmptyStatus(false);
                }
            }
        };
        checkTable();
    }, [selectedMysqlConnection, selectedTable, createNewTable]);

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
                const headers = await loadSheetHeaders();
                const schema = await loadMysqlSchema();

                // Decide source based on current direction settings
                // If Bidirectional, check initialSyncSource. If One-Way, infer from direction.
                let effectiveSource: 'sheets' | 'mysql' = 'sheets';
                if (syncDirection === 'mysql_to_sheets') {
                    effectiveSource = 'mysql';
                    setInitialSyncSource('mysql');
                } else if (syncDirection === 'sheets_to_mysql') {
                    effectiveSource = 'sheets';
                    setInitialSyncSource('sheets');
                } else {
                    // Bidirectional - use current initialSyncSource state
                    effectiveSource = initialSyncSource;
                }

                generateMappings(effectiveSource, headers, schema);
                setStep('mapping');
                break;

            case 'mapping':
                const hasPrimaryKey = columnMappings.some(m => m.isPrimaryKey);
                if (!hasPrimaryKey) {
                    setError('Please select a primary key column');
                    return;
                }

                // Empty source validation
                if (syncDirection === 'sheets_to_mysql' && isSheetEmpty) {
                    setError('Cannot use empty Google Sheet as source for One-Way sync');
                    return;
                }
                if (syncDirection === 'mysql_to_sheets' && isTableEmpty && !createNewTable) {
                    setError('Cannot use empty MySQL Table as source for One-Way sync');
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
                                    disabled={isGoogleConnecting}
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

                            <button
                                className="connection-option add-new"
                                onClick={handleConnectGoogle}
                                disabled={isGoogleConnecting}
                            >
                                <div className="connection-icon">
                                    {isGoogleConnecting ? <Loader2 size={20} className="spin" /> : <Plus size={20} />}
                                </div>
                                <div className="connection-info">
                                    <span className="connection-name">
                                        {isGoogleConnecting ? 'Connecting...' : 'Connect New Account'}
                                    </span>
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
                                            onClick={async () => {
                                                if (selectedMysqlConnection === conn.id) return; // Already selected
                                                setSelectedMysqlConnection(conn.id);
                                                setIsMysqlSelecting(true);
                                                await loadMysqlTables(conn.id);
                                                setIsMysqlSelecting(false);
                                            }}
                                            disabled={isMysqlSelecting}
                                        >
                                            <div className="connection-icon mysql">
                                                {isMysqlSelecting && selectedMysqlConnection === conn.id ? (
                                                    <Loader2 size={20} className="spin" />
                                                ) : (
                                                    <Database size={20} />
                                                )}
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

                                    <button className="connection-option add-new" disabled={isMysqlSelecting} onClick={() => setShowNewMysqlForm(true)}>
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
                                        onChange={async () => {
                                            setSyncDirection('sheets_to_mysql');
                                            setInitialSyncSource('sheets');
                                            const headers = await loadSheetHeaders();
                                            generateMappings('sheets', headers, undefined);
                                        }}
                                    />
                                    <span>Sheets → MySQL (one-way)</span>
                                </label>
                                <label className="radio-option">
                                    <input
                                        type="radio"
                                        name="syncDirection"
                                        value="mysql_to_sheets"
                                        checked={syncDirection === 'mysql_to_sheets'}
                                        onChange={() => {
                                            setSyncDirection('mysql_to_sheets');
                                            setInitialSyncSource('mysql');
                                            generateMappings('mysql', undefined, mysqlSchema);
                                        }}
                                    />
                                    <span>MySQL → Sheets (one-way)</span>
                                </label>
                                <label className="radio-option">
                                    <input
                                        type="radio"
                                        name="syncDirection"
                                        value="bidirectional"
                                        checked={syncDirection === 'bidirectional'}
                                        onChange={() => {
                                            setSyncDirection('bidirectional');
                                            // Keep current initial source or default to sheets?
                                            // Let's keep current, but ensure mappings are consistent with it
                                            generateMappings(initialSyncSource, undefined, mysqlSchema);
                                            if (initialSyncSource === 'sheets') loadSheetHeaders().then(h => generateMappings('sheets', h, undefined));
                                            else generateMappings('mysql', undefined, mysqlSchema);
                                        }}
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
                                    <label className={`radio-option ${isSheetEmpty ? 'disabled' : ''}`}>
                                        <input
                                            type="radio"
                                            name="initialSyncSource"
                                            value="sheets"
                                            checked={initialSyncSource === 'sheets'}
                                            disabled={isSheetEmpty}
                                            onChange={async () => {
                                                setInitialSyncSource('sheets');
                                                const headers = await loadSheetHeaders();
                                                generateMappings('sheets', headers, undefined);
                                            }}
                                        />
                                        <span>Google Sheets (overwrite Database)</span>
                                        {isSheetEmpty && <span className="warning-text" style={{ marginLeft: '8px', color: 'var(--error-500)', fontSize: '0.8em' }}>(Empty)</span>}
                                    </label>
                                    <label className={`radio-option ${(isTableEmpty && !createNewTable) ? 'disabled' : ''}`}>
                                        <input
                                            type="radio"
                                            name="initialSyncSource"
                                            value="mysql"
                                            checked={initialSyncSource === 'mysql'}
                                            disabled={isTableEmpty && !createNewTable}
                                            onChange={() => {
                                                setInitialSyncSource('mysql');
                                                generateMappings('mysql', undefined, mysqlSchema);
                                            }}
                                        />
                                        <span>MySQL (overwrite Sheet)</span>
                                        {(isTableEmpty && !createNewTable) && <span className="warning-text" style={{ marginLeft: '8px', color: 'var(--error-500)', fontSize: '0.8em' }}>(Empty)</span>}
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
                    disabled={loading || checkingEmptyStatus}
                >
                    {loading || checkingEmptyStatus ? (
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
