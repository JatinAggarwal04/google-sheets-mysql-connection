import { supabase } from './supabase';

const API_BASE = '/api';

async function getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabase.auth.getSession();

    return {
        'Content-Type': 'application/json',
        ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
    };
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Network error' } }));
        throw new Error(error.error?.message || 'Request failed');
    }
    return response.json();
}

// ========== CONNECTIONS API ==========

export async function fetchConnections() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/connections`, { headers });
    return handleResponse<any[]>(response);
}

export async function createConnection(data: {
    name: string;
    spreadsheetId: string;
    sheetName: string;
    mysqlTableName: string;
    columnMapping: Record<string, string>;
}) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/connections`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean; id: string }>(response);
}

export async function deleteConnection(id: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/connections/${id}`, {
        method: 'DELETE',
        headers,
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function pauseConnection(id: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/connections/${id}/pause`, {
        method: 'POST',
        headers,
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function resumeConnection(id: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/connections/${id}/resume`, {
        method: 'POST',
        headers,
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function previewSheet(spreadsheetId: string, sheetName: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/connections/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ spreadsheetId, sheetName }),
    });
    return handleResponse<{ headers: string[]; rowCount: number }>(response);
}

// ========== DATA API ==========

export async function fetchSheetsData(connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/sheets?connectionId=${connectionId}`, { headers });
    return handleResponse<{ headers: string[]; rows: any[] }>(response);
}

export async function fetchMySQLData(connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/mysql?connectionId=${connectionId}`, { headers });
    return handleResponse<{ columns: string[]; rows: any[] }>(response);
}

export async function addSheetRow(data: Record<string, unknown>, connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/sheets?connectionId=${connectionId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean; rowNumber: number }>(response);
}

export async function updateSheetRow(row: number, data: Record<string, unknown>, connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/sheets/${row}?connectionId=${connectionId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function deleteSheetRow(row: number, connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/sheets/${row}?connectionId=${connectionId}`, {
        method: 'DELETE',
        headers,
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function addMySQLRow(data: Record<string, unknown>, connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/mysql?connectionId=${connectionId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean; id: number }>(response);
}

export async function updateMySQLRow(id: number, data: Record<string, unknown>, connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/mysql/${id}?connectionId=${connectionId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function deleteMySQLRow(id: number, connectionId: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/data/mysql/${id}?connectionId=${connectionId}`, {
        method: 'DELETE',
        headers,
    });
    return handleResponse<{ success: boolean }>(response);
}

// ========== SYNC API ==========

export async function fetchSyncStatus(connectionId?: string) {
    const headers = await getAuthHeaders();
    const url = connectionId
        ? `${API_BASE}/sync/status?connectionId=${connectionId}`
        : `${API_BASE}/sync/status`;
    const response = await fetch(url, { headers });
    return handleResponse<any>(response);
}

export async function triggerSync(connectionId?: string) {
    const headers = await getAuthHeaders();
    const url = connectionId
        ? `${API_BASE}/sync/trigger?connectionId=${connectionId}`
        : `${API_BASE}/sync/trigger`;
    const response = await fetch(url, {
        method: 'POST',
        headers,
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function fetchConflicts() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/sync/conflicts`, { headers });
    return handleResponse<{ count: number; conflicts: any[] }>(response);
}
