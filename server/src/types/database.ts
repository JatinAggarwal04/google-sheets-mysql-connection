// ===========================================
// Supabase Database Types
// ===========================================

export interface Database {
    public: {
        Tables: {
            tenants: {
                Row: {
                    id: string;
                    user_id: string;
                    email: string;
                    name: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    email: string;
                    name?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    email?: string;
                    name?: string | null;
                    updated_at?: string;
                };
            };
            google_connections: {
                Row: {
                    id: string;
                    tenant_id: string;
                    email: string;
                    encrypted_tokens: string;
                    scopes: string[];
                    is_valid: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    email: string;
                    encrypted_tokens: string;
                    scopes: string[];
                    is_valid?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    email?: string;
                    encrypted_tokens?: string;
                    scopes?: string[];
                    is_valid?: boolean;
                    updated_at?: string;
                };
            };
            mysql_connections: {
                Row: {
                    id: string;
                    tenant_id: string;
                    name: string;
                    host: string;
                    port: number;
                    database: string;
                    encrypted_credentials: string;
                    is_valid: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    name: string;
                    host: string;
                    port: number;
                    database: string;
                    encrypted_credentials: string;
                    is_valid?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    name?: string;
                    host?: string;
                    port?: number;
                    database?: string;
                    encrypted_credentials?: string;
                    is_valid?: boolean;
                    updated_at?: string;
                };
            };
            integrations: {
                Row: {
                    id: string;
                    tenant_id: string;
                    name: string;
                    google_connection_id: string;
                    mysql_connection_id: string;
                    spreadsheet_id: string;
                    sheet_name: string;
                    table_name: string;
                    sync_direction: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional';
                    status: 'active' | 'paused' | 'error' | 'pending';
                    last_sync_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    name: string;
                    google_connection_id: string;
                    mysql_connection_id: string;
                    spreadsheet_id: string;
                    sheet_name: string;
                    table_name: string;
                    sync_direction?: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional';
                    status?: 'active' | 'paused' | 'error' | 'pending';
                    last_sync_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    name?: string;
                    google_connection_id?: string;
                    mysql_connection_id?: string;
                    spreadsheet_id?: string;
                    sheet_name?: string;
                    table_name?: string;
                    sync_direction?: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional';
                    status?: 'active' | 'paused' | 'error' | 'pending';
                    last_sync_at?: string | null;
                    updated_at?: string;
                };
            };
            column_mappings: {
                Row: {
                    id: string;
                    integration_id: string;
                    sheet_column: string;
                    mysql_column: string;
                    data_type: string;
                    is_primary_key: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    integration_id: string;
                    sheet_column: string;
                    mysql_column: string;
                    data_type: string;
                    is_primary_key?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    sheet_column?: string;
                    mysql_column?: string;
                    data_type?: string;
                    is_primary_key?: boolean;
                    updated_at?: string;
                };
            };
            sync_state: {
                Row: {
                    id: string;
                    integration_id: string;
                    last_sheet_hash: string | null;
                    last_mysql_hash: string | null;
                    last_sync_version: number;
                    conflict_resolution: 'sheets_wins' | 'mysql_wins' | 'latest_wins';
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    integration_id: string;
                    last_sheet_hash?: string | null;
                    last_mysql_hash?: string | null;
                    last_sync_version?: number;
                    conflict_resolution?: 'sheets_wins' | 'mysql_wins' | 'latest_wins';
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    last_sheet_hash?: string | null;
                    last_mysql_hash?: string | null;
                    last_sync_version?: number;
                    conflict_resolution?: 'sheets_wins' | 'mysql_wins' | 'latest_wins';
                    updated_at?: string;
                };
            };
            sync_logs: {
                Row: {
                    id: string;
                    integration_id: string;
                    status: 'started' | 'completed' | 'failed';
                    direction: 'sheets_to_mysql' | 'mysql_to_sheets';
                    rows_processed: number;
                    rows_inserted: number;
                    rows_updated: number;
                    rows_deleted: number;
                    error_message: string | null;
                    started_at: string;
                    completed_at: string | null;
                };
                Insert: {
                    id?: string;
                    integration_id: string;
                    status: 'started' | 'completed' | 'failed';
                    direction: 'sheets_to_mysql' | 'mysql_to_sheets';
                    rows_processed?: number;
                    rows_inserted?: number;
                    rows_updated?: number;
                    rows_deleted?: number;
                    error_message?: string | null;
                    started_at?: string;
                    completed_at?: string | null;
                };
                Update: {
                    status?: 'started' | 'completed' | 'failed';
                    rows_processed?: number;
                    rows_inserted?: number;
                    rows_updated?: number;
                    rows_deleted?: number;
                    error_message?: string | null;
                    completed_at?: string | null;
                };
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: {
            sync_direction: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional';
            integration_status: 'active' | 'paused' | 'error' | 'pending';
            sync_status: 'started' | 'completed' | 'failed';
            conflict_resolution: 'sheets_wins' | 'mysql_wins' | 'latest_wins';
        };
    };
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Update'];

// Specific table types
export type Tenant = Tables<'tenants'>;
export type GoogleConnection = Tables<'google_connections'>;
export type MySQLConnection = Tables<'mysql_connections'>;
export type Integration = Tables<'integrations'>;
export type ColumnMapping = Tables<'column_mappings'>;
export type SyncState = Tables<'sync_state'>;
export type SyncLog = Tables<'sync_logs'>;
