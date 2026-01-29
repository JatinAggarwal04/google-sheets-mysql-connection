// ===========================================
// API Types
// ===========================================

import { z } from 'zod';

// Auth
export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

export const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().optional(),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type SignupRequest = z.infer<typeof signupSchema>;

// MySQL Connection
export const mysqlConnectionSchema = z.object({
    name: z.string().min(1),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
});

export type CreateMySQLConnectionRequest = z.infer<typeof mysqlConnectionSchema>;

// Integration
export const createIntegrationSchema = z.object({
    name: z.string().min(1),
    googleConnectionId: z.string().uuid(),
    mysqlConnectionId: z.string().uuid(),
    spreadsheetId: z.string().min(1),
    sheetName: z.string().min(1),
    tableName: z.string().min(1),
    syncDirection: z.enum(['sheets_to_mysql', 'mysql_to_sheets', 'bidirectional']),
    columnMappings: z.array(
        z.object({
            sheetColumn: z.string().min(1),
            mysqlColumn: z.string().min(1),
            dataType: z.string().min(1),
            isPrimaryKey: z.boolean().optional(),
        })
    ),
    conflictResolution: z.enum(['sheets_wins', 'mysql_wins', 'latest_wins']).optional(),
});

export type CreateIntegrationRequest = z.infer<typeof createIntegrationSchema>;

// API Response
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

// Pagination
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// Sync Job
export interface SyncJobPayload {
    integrationId: string;
    tenantId: string;
    direction: 'sheets_to_mysql' | 'mysql_to_sheets';
    triggeredBy: 'initial' | 'scheduled' | 'webhook' | 'manual';
}
