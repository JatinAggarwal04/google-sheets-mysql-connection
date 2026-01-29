// ===========================================
// Sync Engine Service
// ===========================================

import crypto from 'crypto';
import { Job } from 'bullmq';
import { getSupabaseAdmin } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { SyncError } from '../lib/errors.js';
import * as sheetsService from './google-sheets.service.js';
import * as mysqlService from './mysql.service.js';
import * as integrationService from './integration.service.js';
import type { SyncJobPayload } from '../types/api.js';
import type { Integration, ColumnMapping, SyncState, SyncLog } from '../types/database.js';

interface SyncResult {
    rowsProcessed: number;
    rowsInserted: number;
    rowsUpdated: number;
    rowsDeleted: number;
}

interface DiffResult {
    toInsert: Record<string, unknown>[];
    toUpdate: Array<{ data: Record<string, unknown>; primaryKeyColumn: string; primaryKeyValue: unknown }>;
    toDelete: unknown[];
}

/**
 * Computes hash of data for change detection
 */
function computeHash(data: Record<string, unknown>[]): string {
    const sorted = data.map((row) =>
        JSON.stringify(Object.entries(row).sort((a, b) => a[0].localeCompare(b[0])))
    ).sort();
    return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/**
 * Computes diff between source and target data
 */
function computeDiff(
    sourceData: Record<string, unknown>[],
    targetData: Record<string, unknown>[],
    primaryKeyColumn: string,
    columnMappings: ColumnMapping[],
    direction: 'sheets_to_mysql' | 'mysql_to_sheets'
): DiffResult {
    const result: DiffResult = {
        toInsert: [],
        toUpdate: [],
        toDelete: [],
    };

    // Create lookup maps
    const sourceMap = new Map<string, Record<string, unknown>>();
    const targetMap = new Map<string, Record<string, unknown>>();

    sourceData.forEach((row) => {
        const key = String(row[primaryKeyColumn] ?? '');
        if (key) sourceMap.set(key, row);
    });

    targetData.forEach((row) => {
        const key = String(row[primaryKeyColumn] ?? '');
        if (key) targetMap.set(key, row);
    });

    // Find inserts and updates (source has, target doesn't or differs)
    for (const [key, sourceRow] of sourceMap) {
        const targetRow = targetMap.get(key);

        if (!targetRow) {
            // Insert
            result.toInsert.push(sourceRow);
        } else {
            // Check for updates
            let hasChanges = false;

            for (const mapping of columnMappings) {
                const sourceCol = direction === 'sheets_to_mysql' ? mapping.sheet_column : mapping.mysql_column;
                const targetCol = direction === 'sheets_to_mysql' ? mapping.mysql_column : mapping.sheet_column;

                if (String(sourceRow[sourceCol] ?? '') !== String(targetRow[targetCol] ?? '')) {
                    hasChanges = true;
                    break;
                }
            }

            if (hasChanges) {
                result.toUpdate.push({
                    data: sourceRow,
                    primaryKeyColumn,
                    primaryKeyValue: key,
                });
            }
        }
    }

    // Find deletes (target has, source doesn't)
    for (const [key] of targetMap) {
        if (!sourceMap.has(key)) {
            result.toDelete.push(key);
        }
    }

    return result;
}

/**
 * Creates sync log entry
 */
async function createSyncLog(
    integrationId: string,
    direction: 'sheets_to_mysql' | 'mysql_to_sheets'
): Promise<string> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('sync_logs')
        .insert({
            integration_id: integrationId,
            status: 'started',
            direction,
            rows_processed: 0,
            rows_inserted: 0,
            rows_updated: 0,
            rows_deleted: 0,
        })
        .select('id')
        .single();

    if (error) {
        throw new Error('Failed to create sync log');
    }

    return data.id;
}

/**
 * Updates sync log
 */
async function updateSyncLog(
    logId: string,
    status: 'completed' | 'failed',
    result?: SyncResult,
    errorMessage?: string
): Promise<void> {
    const supabase = getSupabaseAdmin();

    await supabase
        .from('sync_logs')
        .update({
            status,
            rows_processed: result?.rowsProcessed || 0,
            rows_inserted: result?.rowsInserted || 0,
            rows_updated: result?.rowsUpdated || 0,
            rows_deleted: result?.rowsDeleted || 0,
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
        })
        .eq('id', logId);
}

/**
 * Syncs from Google Sheets to MySQL
 */
async function syncSheetsToMySQL(
    integration: Integration,
    mappings: ColumnMapping[],
    syncState: SyncState
): Promise<SyncResult> {
    const result: SyncResult = {
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsDeleted: 0,
    };

    // Get sheet data
    const sheetData = await sheetsService.getSheetData(
        integration.google_connection_id,
        integration.spreadsheet_id,
        integration.sheet_name
    );

    // Compute hash to check for changes
    const sheetHash = computeHash(sheetData.rows);

    if (sheetHash === syncState.last_sheet_hash) {
        logger.info(`No changes detected in sheet for integration ${integration.id}`);
        return result;
    }

    // Get MySQL data
    const mysqlData = await mysqlService.getTableData(
        integration.mysql_connection_id,
        integration.table_name
    );

    // Find primary key column
    const primaryKeyMapping = mappings.find((m) => m.is_primary_key);
    if (!primaryKeyMapping) {
        throw new SyncError(integration.id, 'No primary key column defined');
    }

    // Map sheet data to MySQL column names
    const mappedSheetData = sheetData.rows.map((row) => {
        const mapped: Record<string, unknown> = {};
        for (const mapping of mappings) {
            mapped[mapping.mysql_column] = row[mapping.sheet_column];
        }
        return mapped;
    });

    // Compute diff
    const diff = computeDiff(
        mappedSheetData,
        mysqlData,
        primaryKeyMapping.mysql_column,
        mappings,
        'sheets_to_mysql'
    );

    result.rowsProcessed = sheetData.rows.length;

    // Apply changes
    if (diff.toInsert.length > 0) {
        result.rowsInserted = await mysqlService.insertRows(
            integration.mysql_connection_id,
            integration.table_name,
            diff.toInsert
        );
    }

    if (diff.toUpdate.length > 0) {
        result.rowsUpdated = await mysqlService.updateRows(
            integration.mysql_connection_id,
            integration.table_name,
            diff.toUpdate
        );
    }

    if (diff.toDelete.length > 0) {
        result.rowsDeleted = await mysqlService.deleteRows(
            integration.mysql_connection_id,
            integration.table_name,
            primaryKeyMapping.mysql_column,
            diff.toDelete
        );
    }

    // Update sync state
    await integrationService.updateSyncState(integration.id, {
        last_sheet_hash: sheetHash,
        last_sync_version: syncState.last_sync_version + 1,
    });

    return result;
}

/**
 * Syncs from MySQL to Google Sheets
 */
async function syncMySQLToSheets(
    integration: Integration,
    mappings: ColumnMapping[],
    syncState: SyncState
): Promise<SyncResult> {
    const result: SyncResult = {
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsDeleted: 0,
    };

    // Get MySQL data
    const mysqlData = await mysqlService.getTableData(
        integration.mysql_connection_id,
        integration.table_name
    );

    // Compute hash
    const mysqlHash = computeHash(mysqlData);

    if (mysqlHash === syncState.last_mysql_hash) {
        logger.info(`No changes detected in MySQL for integration ${integration.id}`);
        return result;
    }

    // Map MySQL data to sheet column names
    const mappedMysqlData = mysqlData.map((row) => {
        const mapped: Record<string, unknown> = {};
        for (const mapping of mappings) {
            mapped[mapping.sheet_column] = row[mapping.mysql_column];
        }
        return mapped;
    });

    // Get headers from mappings
    const headers = mappings.map((m) => m.sheet_column);

    // Update sheet (full replace for simplicity)
    await sheetsService.updateSheetData(
        integration.google_connection_id,
        integration.spreadsheet_id,
        integration.sheet_name,
        headers,
        mappedMysqlData
    );

    result.rowsProcessed = mysqlData.length;
    result.rowsUpdated = mysqlData.length;

    // Update sync state
    await integrationService.updateSyncState(integration.id, {
        last_mysql_hash: mysqlHash,
        last_sync_version: syncState.last_sync_version + 1,
    });

    return result;
}

/**
 * Main sync processor for the queue worker
 */
export async function processSyncJob(job: Job<SyncJobPayload>): Promise<void> {
    const { integrationId, tenantId, direction } = job.data;

    logger.info(`Processing sync job ${job.id} for integration ${integrationId}`);

    // Get integration
    const integration = await integrationService.getIntegration(tenantId, integrationId);

    if (integration.status !== 'active') {
        logger.info(`Skipping sync for paused/error integration ${integrationId}`);
        return;
    }

    // Get mappings and sync state
    const mappings = await integrationService.getColumnMappings(integrationId);
    let syncState = await integrationService.getSyncState(integrationId);

    if (!syncState) {
        // Create default sync state
        const supabase = getSupabaseAdmin();
        await supabase.from('sync_state').insert({
            integration_id: integrationId,
            last_sync_version: 0,
            conflict_resolution: 'latest_wins',
        });
        syncState = await integrationService.getSyncState(integrationId);
    }

    // Create sync log
    const logId = await createSyncLog(integrationId, direction);

    try {
        let result: SyncResult;

        if (direction === 'sheets_to_mysql') {
            result = await syncSheetsToMySQL(integration, mappings, syncState!);
        } else {
            result = await syncMySQLToSheets(integration, mappings, syncState!);
        }

        // Update integration last sync
        await integrationService.updateLastSync(integrationId);

        // Update log
        await updateSyncLog(logId, 'completed', result);

        logger.info(
            `Sync completed for ${integrationId}: ${result.rowsInserted} inserted, ${result.rowsUpdated} updated, ${result.rowsDeleted} deleted`
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await updateSyncLog(logId, 'failed', undefined, errorMessage);
        await integrationService.updateIntegrationStatus(integrationId, 'error');

        logger.error(`Sync failed for ${integrationId}:`, error);

        throw error;
    }
}

/**
 * Gets sync logs for integration
 */
export async function getSyncLogs(
    integrationId: string,
    limit: number = 50
): Promise<SyncLog[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('integration_id', integrationId)
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error) {
        logger.error('Failed to get sync logs:', error);
        return [];
    }

    return data || [];
}
