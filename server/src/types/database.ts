// ===========================================
// Supabase Database Types
// ===========================================

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            tenants: {
                Row: {
                    id: string
                    user_id: string
                    email: string
                    name: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    email: string
                    name?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    email?: string
                    name?: string | null
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "tenants_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: true
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    }
                ]
            }
            google_connections: {
                Row: {
                    id: string
                    tenant_id: string
                    email: string
                    encrypted_tokens: string
                    scopes: string[]
                    is_valid: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    email: string
                    encrypted_tokens: string
                    scopes: string[]
                    is_valid?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    tenant_id?: string
                    email?: string
                    encrypted_tokens?: string
                    scopes?: string[]
                    is_valid?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "google_connections_tenant_id_fkey"
                        columns: ["tenant_id"]
                        isOneToOne: false
                        referencedRelation: "tenants"
                        referencedColumns: ["id"]
                    }
                ]
            }
            mysql_connections: {
                Row: {
                    id: string
                    tenant_id: string
                    name: string
                    host: string
                    port: number
                    database: string
                    username: string
                    encrypted_credentials: string
                    is_valid: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    name: string
                    host: string
                    port?: number
                    database: string
                    username: string
                    encrypted_credentials: string
                    is_valid?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    tenant_id?: string
                    name?: string
                    host?: string
                    port?: number
                    database?: string
                    username?: string
                    encrypted_credentials?: string
                    is_valid?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "mysql_connections_tenant_id_fkey"
                        columns: ["tenant_id"]
                        isOneToOne: false
                        referencedRelation: "tenants"
                        referencedColumns: ["id"]
                    }
                ]
            }
            integrations: {
                Row: {
                    id: string
                    tenant_id: string
                    name: string
                    google_connection_id: string
                    mysql_connection_id: string
                    spreadsheet_id: string
                    sheet_name: string
                    table_name: string
                    sync_direction: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional'
                    status: 'active' | 'paused' | 'error' | 'pending'
                    last_sync_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    name: string
                    google_connection_id: string
                    mysql_connection_id: string
                    spreadsheet_id: string
                    sheet_name: string
                    table_name: string
                    sync_direction?: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional'
                    status?: 'active' | 'paused' | 'error' | 'pending'
                    last_sync_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    tenant_id?: string
                    name?: string
                    google_connection_id?: string
                    mysql_connection_id?: string
                    spreadsheet_id?: string
                    sheet_name?: string
                    table_name?: string
                    sync_direction?: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional'
                    status?: 'active' | 'paused' | 'error' | 'pending'
                    last_sync_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "integrations_tenant_id_fkey"
                        columns: ["tenant_id"]
                        isOneToOne: false
                        referencedRelation: "tenants"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "integrations_google_connection_id_fkey"
                        columns: ["google_connection_id"]
                        isOneToOne: false
                        referencedRelation: "google_connections"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "integrations_mysql_connection_id_fkey"
                        columns: ["mysql_connection_id"]
                        isOneToOne: false
                        referencedRelation: "mysql_connections"
                        referencedColumns: ["id"]
                    }
                ]
            }
            column_mappings: {
                Row: {
                    id: string
                    integration_id: string
                    sheet_column: string
                    mysql_column: string
                    data_type: string
                    is_primary_key: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    integration_id: string
                    sheet_column: string
                    mysql_column: string
                    data_type: string
                    is_primary_key?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    integration_id?: string
                    sheet_column?: string
                    mysql_column?: string
                    data_type?: string
                    is_primary_key?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "column_mappings_integration_id_fkey"
                        columns: ["integration_id"]
                        isOneToOne: false
                        referencedRelation: "integrations"
                        referencedColumns: ["id"]
                    }
                ]
            }
            sync_state: {
                Row: {
                    id: string
                    integration_id: string
                    sheets_hash: string | null
                    mysql_hash: string | null
                    last_sync_version: number
                    conflict_resolution: 'sheets_wins' | 'mysql_wins' | 'latest_wins'
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    integration_id: string
                    sheets_hash?: string | null
                    mysql_hash?: string | null
                    last_sync_version?: number
                    conflict_resolution?: 'sheets_wins' | 'mysql_wins' | 'latest_wins'
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    integration_id?: string
                    sheets_hash?: string | null
                    mysql_hash?: string | null
                    last_sync_version?: number
                    conflict_resolution?: 'sheets_wins' | 'mysql_wins' | 'latest_wins'
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "sync_state_integration_id_fkey"
                        columns: ["integration_id"]
                        isOneToOne: true
                        referencedRelation: "integrations"
                        referencedColumns: ["id"]
                    }
                ]
            }
            sync_logs: {
                Row: {
                    id: string
                    integration_id: string
                    status: 'started' | 'completed' | 'failed'
                    direction: 'sheets_to_mysql' | 'mysql_to_sheets'
                    rows_processed: number
                    rows_inserted: number
                    rows_updated: number
                    rows_deleted: number
                    error_message: string | null
                    started_at: string
                    completed_at: string | null
                }
                Insert: {
                    id?: string
                    integration_id: string
                    status: 'started' | 'completed' | 'failed'
                    direction: 'sheets_to_mysql' | 'mysql_to_sheets'
                    rows_processed?: number
                    rows_inserted?: number
                    rows_updated?: number
                    rows_deleted?: number
                    error_message?: string | null
                    started_at?: string
                    completed_at?: string | null
                }
                Update: {
                    id?: string
                    integration_id?: string
                    status?: 'started' | 'completed' | 'failed'
                    direction?: 'sheets_to_mysql' | 'mysql_to_sheets'
                    rows_processed?: number
                    rows_inserted?: number
                    rows_updated?: number
                    rows_deleted?: number
                    error_message?: string | null
                    started_at?: string
                    completed_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "sync_logs_integration_id_fkey"
                        columns: ["integration_id"]
                        isOneToOne: false
                        referencedRelation: "integrations"
                        referencedColumns: ["id"]
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            sync_direction: 'sheets_to_mysql' | 'mysql_to_sheets' | 'bidirectional'
            integration_status: 'active' | 'paused' | 'error' | 'pending'
            sync_status: 'started' | 'completed' | 'failed'
            conflict_resolution: 'sheets_wins' | 'mysql_wins' | 'latest_wins'
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type Tenant = Tables<'tenants'>
export type GoogleConnection = Tables<'google_connections'>
export type MySQLConnection = Tables<'mysql_connections'>
export type Integration = Tables<'integrations'>
export type ColumnMapping = Tables<'column_mappings'>
export type SyncState = Tables<'sync_state'>
export type SyncLog = Tables<'sync_logs'>

