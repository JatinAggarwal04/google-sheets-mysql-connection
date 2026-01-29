import { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Tabs } from '../components/Tabs';
import { StatusDashboard } from '../components/StatusDashboard';
import { SheetsView } from '../components/SheetsView';
import { MySQLView } from '../components/MySQLView';

type TabId = 'status' | 'sheets' | 'mysql';

export default function ConnectionDetail() {
    // Phase 2: We might use id to fetch specific connection config
    // const { id } = useParams(); 

    const [activeTab, setActiveTab] = useState<TabId>('status');
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
    const [statusText, setStatusText] = useState('Connecting...');

    // Status Data
    const [syncStatus, setSyncStatus] = useState('Idle');
    const [pendingChanges, setPendingChanges] = useState(0);
    const [conflictCount, setConflictCount] = useState(0);
    const [lastSync, setLastSync] = useState('Never');
    const [eventLog, setEventLog] = useState<Array<{ type: string; message: string; timestamp: string }>>([]);

    // Table Data
    const [sheetsData, setSheetsData] = useState<any>(null);
    const [mysqlData, setMysqlData] = useState<any>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // WebSocket
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // In dev, vite runs on 5173 but backend on 3000. Need to point to backend port if not proxied.
        // Assuming proxy is set up or using same host in prod.
        // For dev, hardcode port 3000 if needed, or use relative if proxy.
        // Vite proxy usually handles /ws.
        // Vite proxy usually handles /ws.

        // Use a simpler approach for now: verify calling pattern from legacy app
        // Legacy: const wsUrl = `${protocol}//${window.location.host}/ws`;

        let ws: WebSocket;

        try {
            // Adjust port for local dev if needed (Vite 5173 -> Express 3000)
            const host = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
            ws = new WebSocket(`${protocol}//${host}/ws`);

            ws.onopen = () => {
                setStatus('connected');
                setStatusText('Connected');
                addLog('info', 'WebSocket connected');
            };

            ws.onclose = () => {
                setStatus('disconnected');
                setStatusText('Disconnected');
                addLog('error', 'WebSocket disconnected');
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleMessage(message);
            };
        } catch (error) {
            console.error('WS Error', error);
        }

        return () => {
            if (ws) ws.close();
        };
    }, []);

    const addLog = (type: string, message: string) => {
        setEventLog(prev => [{
            type,
            message,
            timestamp: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 100));
    };

    const handleMessage = (msg: any) => {
        const { type, data } = msg;
        switch (type) {
            case 'status:update':
                if (data.currentOperation) setSyncStatus(data.currentOperation);
                if (data.pendingChanges !== undefined) setPendingChanges(data.pendingChanges);
                if (data.unresolvedConflicts !== undefined) setConflictCount(data.unresolvedConflicts);
                if (data.lastSyncAt) setLastSync(new Date(data.lastSyncAt).toLocaleTimeString());
                break;
            case 'sync:start':
                setSyncStatus('Syncing...');
                addLog('sync', 'Full sync started');
                break;
            case 'sync:complete':
                setSyncStatus('Idle');
                addLog('sync', `Sync completed: ${data.processed} rows`);
                fetchData('sheets');
                fetchData('mysql');
                break;
            case 'sync:error':
                setSyncStatus('Error');
                addLog('error', `Sync error: ${data.message}`);
                break;
            case 'change:processed':
                addLog('change', `${data.operation} on row ${data.rowId} from ${data.origin}`);
                break;
        }
    };

    const fetchInitialStatus = async () => {
        try {
            const res = await fetch('/api/sync/status');
            const data = await res.json();
            handleMessage({ type: 'status:update', data });
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchInitialStatus();
    }, []);

    const fetchData = async (source: 'sheets' | 'mysql') => {
        setIsLoadingData(true);
        try {
            const res = await fetch(`/api/data/${source}`);
            const data = await res.json();
            if (source === 'sheets') setSheetsData(data);
            else setMysqlData(data);
        } catch (error) {
            console.error(error);
            addLog('error', `Failed to fetch ${source} data`);
        } finally {
            setIsLoadingData(false);
        }
    };

    // Load data when tab changes
    useEffect(() => {
        if (activeTab === 'sheets' && !sheetsData) fetchData('sheets');
        if (activeTab === 'mysql' && !mysqlData) fetchData('mysql');
    }, [activeTab]);

    const handleTriggerSync = async () => {
        // Simplified: Assume no API key needed for logged in user (auth middleware handles it)
        // Legacy app asked for API Key because it wasn't auth-protected.
        // New app is auth-protected.
        try {
            await fetch('/api/sync/trigger', { method: 'POST' });
            addLog('sync', 'Triggered full sync');
        } catch (e) {
            addLog('error', 'Failed to trigger sync');
        }
    };

    return (
        <div className="app">
            <Header status={status} statusText={statusText} />

            <main className="main">
                <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

                {activeTab === 'status' && (
                    <StatusDashboard
                        syncStatus={syncStatus}
                        pendingChanges={pendingChanges}
                        conflictCount={conflictCount}
                        lastSync={lastSync}
                        eventLog={eventLog}
                        onTriggerSync={handleTriggerSync}
                        onRefresh={fetchInitialStatus}
                        onClearLog={() => setEventLog([])}
                    />
                )}

                {activeTab === 'sheets' && (
                    <SheetsView
                        data={sheetsData?.rows || []}
                        headers={sheetsData?.headers || []}
                        isLoading={isLoadingData}
                        onAddRow={() => { }} // TODO: Implement Add Modal
                        onRefresh={() => fetchData('sheets')}
                    />
                )}

                {activeTab === 'mysql' && (
                    <MySQLView
                        data={mysqlData?.rows || []}
                        headers={mysqlData?.headers || []}
                        isLoading={isLoadingData}
                        onAddRow={() => { }} // TODO: Implement Add Modal
                        onRefresh={() => fetchData('mysql')}
                    />
                )}
            </main>
        </div>
    );
}
