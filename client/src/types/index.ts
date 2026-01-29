export interface User {
    id: string;
    email: string;
}

export interface Session {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    user: User;
}

export interface Connection {
    id: string;
    name: string;
    spreadsheetId: string;
    sheetName: string;
    mysqlTableName: string;
    status: 'active' | 'paused' | 'error';
    createdAt: string;
    updatedAt: string;
    runtimeStatus?: {
        isRunning: boolean;
        lastSync?: string;
        error?: string;
    };
}

export interface CreateConnectionPayload {
    name: string;
    spreadsheetId: string;
    sheetName: string;
    mysqlTableName: string;
    columnMapping: Record<string, string>;
}

export interface SyncStatus {
    state: 'idle' | 'syncing' | 'error';
    lastSync: string | null;
    pendingChanges: number;
    conflicts: number;
    queue?: {
        pending: number;
        processed: number;
        failed: number;
    };
}

export interface DataRow {
    id: number | string;
    _row_number?: number;
    [key: string]: unknown;
}

export interface WebSocketMessage {
    type: string;
    data?: unknown;
    timestamp: number;
}

export interface ApiError {
    error: {
        code: string;
        message: string;
    };
}
