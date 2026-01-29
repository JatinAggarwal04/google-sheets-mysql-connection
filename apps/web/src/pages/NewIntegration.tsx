
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { Check, ChevronRight } from 'lucide-react';

const STEPS = ['Select Sheet', 'MySQL Connection', 'Mapping', 'Review'];

export default function NewIntegration() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Data State
    const [sheetFiles, setSheetFiles] = useState<any[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<any>(null); // File
    const [sheetDetails, setSheetDetails] = useState<any>(null); // Tabs
    const [selectedTab, setSelectedTab] = useState<string>('');
    const [selectedRange, setSelectedRange] = useState<string>(''); // Default A:Z?

    const [mysqlConfig, setMysqlConfig] = useState({
        host: '', user: '', password: '', database: '', table: '', port: 3306
    });
    const [mysqlTables, setMysqlTables] = useState<string[]>([]);
    const [dbColumns, setDbColumns] = useState<any[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({}); // dbColumn -> sheetHeader

    useEffect(() => {
        // Load initial data for step 0
        if (currentStep === 0) fetchSheets();
    }, [currentStep]);

    const getAuthHeader = async () => {
        const { data } = await supabase.auth.getSession();
        return { Authorization: `Bearer ${data.session?.access_token}` };
    };

    const fetchSheets = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeader();
            const res = await fetch('http://localhost:3000/api/google/spreadsheets', { headers });
            const data = await res.json();
            setSheetFiles(data.files || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSheetSelect = async (file: any) => {
        setSelectedSheet(file);
        setLoading(true);
        try {
            const headers = await getAuthHeader();
            const res = await fetch(`http://localhost:3000/api/google/spreadsheets/${file.id}`, { headers });
            const data = await res.json();
            setSheetDetails(data);
            if (data.sheets?.length > 0) {
                setSelectedTab(data.sheets[0].title);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) setCurrentStep(c => c + 1);
    };

    const handleTestConnection = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeader();
            const res = await fetch('http://localhost:3000/api/mysql/validate', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(mysqlConfig)
            });
            const data = await res.json();
            if (res.ok) {
                alert('Connection Successful!');
                fetchTables();
            } else {
                alert(`Connection Failed: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('Connection Failed');
        } finally {
            setLoading(false);
        }
    };

    const fetchTables = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeader();
            const res = await fetch('http://localhost:3000/api/mysql/tables', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(mysqlConfig)
            });
            const data = await res.json();
            setMysqlTables(data.tables || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleStep2Next = async () => {
        if (!mysqlConfig.table) return;
        await fetchColumns();
        handleNext();
    }

    const fetchColumns = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeader();
            const res = await fetch('http://localhost:3000/api/mysql/columns', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: mysqlConfig, table: mysqlConfig.table })
            });
            const data = await res.json();
            setDbColumns(data.columns || []);

            // Auto-map if names match (simple case)
            if (sheetDetails?.sheets && selectedTab) {
                // Find headers for selected tab
                const currentSheet = sheetDetails.sheets.find((s: any) => s.title === selectedTab);
                const sheetHeaders: string[] = currentSheet?.headers || [];

                const newMapping: Record<string, string> = {};
                (data.columns || []).forEach((col: any) => {
                    const match = sheetHeaders.find(h => h.toLowerCase() === col.Field.toLowerCase());
                    if (match) newMapping[col.Field] = match;
                });
                setMapping(newMapping);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateIntegration = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeader();

            // Construct Payload
            const payload = {
                name: `${selectedSheet?.name} - ${mysqlConfig.table}`,
                sourceConfig: {
                    spreadsheetId: selectedSheet?.id,
                    sheetName: selectedTab,
                    range: selectedRange || undefined, // unused for now but passed
                },
                destConfig: mysqlConfig,
                syncMode: 'sheet-to-db' // Default for now
            };

            const res = await fetch('http://localhost:3000/api/integrations', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert('Integration Created Systematially! Sync Started.');
                navigate('/');
            } else {
                const err = await res.json();
                alert(`Error: ${JSON.stringify(err.error)}`);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to create integration');
        } finally {
            setLoading(false);
        }
    }

    const renderStep1 = () => (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Select Source Sheet</h3>
                <p className="mt-1 text-sm text-gray-500">Choose a Google Sheet from your Drive to sync.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="border rounded-md p-4 h-64 overflow-y-auto">
                    {loading && !selectedSheet && <p>Loading sheets...</p>}
                    <ul className="space-y-2">
                        {sheetFiles.map(file => (
                            <li key={file.id}
                                onClick={() => handleSheetSelect(file)}
                                className={cn(
                                    "p-2 rounded cursor-pointer hover:bg-gray-100 flex justify-between items-center",
                                    selectedSheet?.id === file.id ? "bg-indigo-50 border-indigo-200 border" : ""
                                )}
                            >
                                <span className="truncate">{file.name}</span>
                                {selectedSheet?.id === file.id && <Check className="h-4 w-4 text-indigo-600" />}
                            </li>
                        ))}
                    </ul>
                </div>

                {selectedSheet && (
                    <div className="border rounded-md p-4">
                        <h4 className="font-medium mb-3">Configuration</h4>
                        {loading ? <p>Loading details...</p> : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Select Tab</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border"
                                        value={selectedTab}
                                        onChange={(e) => setSelectedTab(e.target.value)}
                                    >
                                        {sheetDetails?.sheets?.map((s: any) => (
                                            <option key={s.sheetId} value={s.title}>{s.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <Button onClick={handleNext} disabled={!selectedSheet || !selectedTab}>
                    Next Step <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Destination MySQL Database</h3>
                <p className="mt-1 text-sm text-gray-500">Enter your database credentials. These will be encrypted.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <input
                    placeholder="Host (e.g. 127.0.0.1)"
                    className="border p-2 rounded"
                    value={mysqlConfig.host}
                    onChange={e => setMysqlConfig({ ...mysqlConfig, host: e.target.value })}
                />
                <input
                    placeholder="Port (Default 3306)"
                    type="number"
                    className="border p-2 rounded"
                    value={mysqlConfig.port}
                    onChange={e => setMysqlConfig({ ...mysqlConfig, port: Number(e.target.value) })}
                />
                <input
                    placeholder="User"
                    className="border p-2 rounded"
                    value={mysqlConfig.user}
                    onChange={e => setMysqlConfig({ ...mysqlConfig, user: e.target.value })}
                />
                <input
                    placeholder="Password"
                    type="password"
                    className="border p-2 rounded"
                    value={mysqlConfig.password}
                    onChange={e => setMysqlConfig({ ...mysqlConfig, password: e.target.value })}
                />
                <input
                    placeholder="Database Name"
                    className="border p-2 rounded"
                    value={mysqlConfig.database}
                    onChange={e => setMysqlConfig({ ...mysqlConfig, database: e.target.value })}
                />
            </div>

            <div className="flex gap-4">
                <Button onClick={handleTestConnection} variant="outline" disabled={loading}>
                    Test Connection & List Tables
                </Button>
            </div>

            {mysqlTables.length > 0 && (
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">Select Table</label>
                    <select
                        className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border"
                        value={mysqlConfig.table}
                        onChange={(e) => setMysqlConfig({ ...mysqlConfig, table: e.target.value })}
                    >
                        <option value="">-- Select Table --</option>
                        {mysqlTables.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setCurrentStep(c => c - 1)}>Back</Button>
                <Button onClick={handleStep2Next} disabled={!mysqlConfig.table}>
                    Next Step <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Map Columns</h3>
                <p className="mt-1 text-sm text-gray-500">Map MySQL columns (Destination) to Google Sheet headers (Source).</p>
            </div>

            <div className="border rounded-md divide-y">
                {dbColumns.map(col => (
                    <div key={col.Field} className="flex items-center justify-between p-4">
                        <div className="w-1/3">
                            <span className="font-medium text-gray-700">{col.Field}</span>
                            <span className="ml-2 text-xs text-gray-400">({col.Type})</span>
                            {col.Key === 'PRI' && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1 rounded">PK</span>}
                        </div>
                        <div className="w-1/3 text-center text-gray-400">←</div>
                        <div className="w-1/3">
                            <select
                                className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border"
                                value={mapping[col.Field] || ''}
                                onChange={(e) => setMapping({ ...mapping, [col.Field]: e.target.value })}
                            >
                                <option value="">-- Ignore --</option>
                                {/* Get headers safely */}
                                {selectedTab && sheetDetails?.sheets?.find((s: any) => s.title === selectedTab)?.headers?.map((h: string) => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setCurrentStep(c => c - 1)}>Back</Button>
                <Button onClick={handleNext}>
                    Next Step <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    const renderStep4 = () => (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Review Integration</h3>
                <p className="mt-1 text-sm text-gray-500">Review your settings and create the sync pipeline.</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-md space-y-2 text-sm">
                <p><strong>Source:</strong> {selectedSheet?.name} / {selectedTab}</p>
                <p><strong>Destination:</strong> MySQL / {mysqlConfig.host} / {mysqlConfig.database} / {mysqlConfig.table}</p>
                <p><strong>Mapped Columns:</strong> {Object.keys(mapping).length}</p>
            </div>

            <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setCurrentStep(c => c - 1)}>Back</Button>
                <Button onClick={handleCreateIntegration} className="bg-green-600 hover:bg-green-500">
                    Confirm & Start Sync
                </Button>
            </div>
        </div>
    );

    return (
        <div className="mx-auto max-w-4xl py-10 px-4">
            <nav aria-label="Progress" className="mb-10">
                <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
                    {STEPS.map((step, index) => (
                        <li key={step} className="md:flex-1">
                            <div className={cn(
                                "group flex flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4",
                                index <= currentStep ? "border-indigo-600" : "border-gray-200"
                            )}>
                                <span className={cn(
                                    "text-sm font-medium",
                                    index <= currentStep ? "text-indigo-600" : "text-gray-500"
                                )}>Step {index + 1}</span>
                                <span className="text-sm font-medium">{step}</span>
                            </div>
                        </li>
                    ))}
                </ol>
            </nav>

            <div className="bg-white p-8 shadow rounded-lg">
                {currentStep === 0 && renderStep1()}
                {currentStep === 1 && renderStep2()}
                {currentStep === 2 && renderStep3()}
                {currentStep === 3 && renderStep4()}
            </div>
        </div>
    );
}
