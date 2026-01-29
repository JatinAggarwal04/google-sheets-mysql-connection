// ===========================================
// API Client
// ===========================================

import { supabase } from './supabase';

const API_BASE = '/api';

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

async function getAuthHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
        return { Authorization: `Bearer ${data.session.access_token}` };
    }
    return {};
}

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const authHeader = await getAuthHeader();

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
            ...options.headers,
        },
    });

    const json: ApiResponse<T> = await response.json();

    if (!json.success) {
        console.error('API Error:', json.error);
        throw new Error(json.error?.message || 'Request failed');
    }

    return json.data as T;
}

// Auth
export const api = {
    auth: {
        me: () => request<{ user: { id: string; email: string }; tenant: { id: string } }>('/auth/me'),
        getGoogleAuthUrl: () => request<{ authUrl: string }>('/auth/google'),
    },

    google: {
        listConnections: () => request<Array<{
            id: string;
            email: string;
            scopes: string[];
            isValid: boolean;
            createdAt: string;
        }>>('/google/connections'),

        deleteConnection: (id: string) => request(`/google/connections/${id}`, { method: 'DELETE' }),

        listSpreadsheets: (connectionId: string) =>
            request<Array<{ id: string; name: string }>>(`/google/spreadsheets?connectionId=${connectionId}`),

        getSpreadsheetInfo: (connectionId: string, spreadsheetId: string) =>
            request<{
                spreadsheetId: string;
                title: string;
                sheets: Array<{ sheetId: number; title: string; rowCount: number; columnCount: number }>;
            }>(`/google/spreadsheets/${spreadsheetId}?connectionId=${connectionId}`),

        getSheetData: (connectionId: string, spreadsheetId: string, sheetName: string) =>
            request<{ headers: string[]; rows: Record<string, unknown>[] }>(
                `/google/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/data?connectionId=${connectionId}`
            ),

        insertRow: (connectionId: string, spreadsheetId: string, sheetName: string, headers: string[], row: Record<string, unknown>) =>
            request(`/google/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/rows?connectionId=${connectionId}`, {
                method: 'POST',
                body: JSON.stringify({ headers, row }),
            }),

        updateRow: (connectionId: string, spreadsheetId: string, sheetName: string, rowIndex: number, headers: string[], row: Record<string, unknown>) =>
            request(`/google/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/rows/${rowIndex}?connectionId=${connectionId}`, {
                method: 'PUT',
                body: JSON.stringify({ headers, row }),
            }),

        deleteRow: (connectionId: string, spreadsheetId: string, sheetName: string, rowIndex: number) =>
            request(`/google/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/rows/${rowIndex}?connectionId=${connectionId}`, {
                method: 'DELETE',
            }),
    },

    mysql: {
        listConnections: () => request<Array<{
            id: string;
            name: string;
            host: string;
            port: number;
            database: string;
            isValid: boolean;
            createdAt: string;
        }>>('/mysql/connections'),

        createConnection: (data: {
            name: string;
            host: string;
            port: number;
            database: string;
            username: string;
            password: string;
        }) => request('/mysql/connections', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        testConnection: (data: {
            name: string;
            host: string;
            port: number;
            database: string;
            username: string;
            password: string;
        }) => request<{ connected: boolean }>('/mysql/connections/test', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        deleteConnection: (id: string) => request(`/mysql/connections/${id}`, { method: 'DELETE' }),

        listTables: (connectionId: string) => request<string[]>(`/mysql/connections/${connectionId}/tables`),

        getTableSchema: (connectionId: string, tableName: string) =>
            request<Array<{ column: string; type: string; nullable: boolean; key: string }>>(
                `/mysql/connections/${connectionId}/tables/${tableName}/schema`
            ),

        getTableData: (connectionId: string, tableName: string) =>
            request<{ columns: string[]; rows: Record<string, unknown>[] }>(
                `/mysql/connections/${connectionId}/tables/${tableName}/data`
            ),

        insertRow: (connectionId: string, tableName: string, row: Record<string, unknown>) =>
            request(`/mysql/connections/${connectionId}/tables/${tableName}/rows`, {
                method: 'POST',
                body: JSON.stringify(row),
            }),

        updateRow: (connectionId: string, tableName: string, primaryKeyColumn: string, primaryKeyValue: string, data: Record<string, unknown>) =>
            request(`/mysql/connections/${connectionId}/tables/${tableName}/rows/${encodeURIComponent(primaryKeyValue)}`, {
                method: 'PUT',
                body: JSON.stringify({ primaryKeyColumn, data }),
            }),

        deleteRow: (connectionId: string, tableName: string, primaryKeyColumn: string, primaryKeyValue: string) =>
            request(`/mysql/connections/${connectionId}/tables/${tableName}/rows/${encodeURIComponent(primaryKeyValue)}?primaryKeyColumn=${encodeURIComponent(primaryKeyColumn)}`, {
                method: 'DELETE',
            }),
    },

    integrations: {
        list: () => request<Array<{
            id: string;
            name: string;
            spreadsheet_id: string;
            sheet_name: string;
            table_name: string;
            sync_direction: string;
            status: string;
            last_sync_at: string | null;
            created_at: string;
        }>>('/integrations'),

        get: (id: string) => request<{
            integration: {
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
            };
            mappings: Array<{
                id: string;
                sheet_column: string;
                mysql_column: string;
                data_type: string;
                is_primary_key: boolean;
            }>;
            syncState: {
                last_sync_version: number;
                conflict_resolution: string;
            } | null;
        }>(`/integrations/${id}`),

        create: (data: {
            name: string;
            googleConnectionId: string;
            mysqlConnectionId: string;
            spreadsheetId: string;
            sheetName: string;
            tableName: string;
            createNewTable?: boolean;
            syncDirection: string;
            columnMappings: Array<{
                sheetColumn: string;
                mysqlColumn: string;
                dataType: string;
                isPrimaryKey?: boolean;
            }>;
            conflictResolution?: string;
        }) => request('/integrations', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request(`/integrations/${id}`, { method: 'DELETE' }),

        pause: (id: string) => request(`/integrations/${id}/pause`, { method: 'POST' }),

        resume: (id: string) => request(`/integrations/${id}/resume`, { method: 'POST' }),

        sync: (id: string) => request(`/integrations/${id}/sync`, { method: 'POST' }),

        getLogs: (id: string) => request<Array<{
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
        }>>(`/integrations/${id}/logs`),
    },

    health: {
        check: () => request<{ status: string; timestamp: string }>('/health'),
        detailed: () => request<{
            status: string;
            services: Record<string, { status: string; latency?: number }>;
            timestamp: string;
        }>('/health/detailed'),
    },
};
