// ===========================================
// Integration Service
// ===========================================

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { enqueueSyncJob } from './queue.service.js';
import type { Integration, ColumnMapping, SyncState } from '../types/database.js';
import type { CreateIntegrationRequest } from '../types/api.js';

/**
 * Creates a new integration with mappings and initializes sync
 */
export async function createIntegration(
    tenantId: string,
    request: CreateIntegrationRequest
): Promise<Integration> {
    const supabase = getSupabaseAdmin();
    const integrationId = uuidv4();

    // Start transaction-like operations
    // Create integration
    const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .insert({
            id: integrationId,
            tenant_id: tenantId,
            name: request.name,
            google_connection_id: request.googleConnectionId,
            mysql_connection_id: request.mysqlConnectionId,
            spreadsheet_id: request.spreadsheetId,
            sheet_name: request.sheetName,
            table_name: request.tableName,
            sync_direction: request.syncDirection,
            status: 'pending',
        })
        .select()
        .single();

    if (integrationError) {
        logger.error('Failed to create integration:', integrationError);
        throw new Error('Failed to create integration');
    }

    // Create column mappings
    const mappingsToInsert = request.columnMappings.map((mapping) => ({
        integration_id: integrationId,
        sheet_column: mapping.sheetColumn,
        mysql_column: mapping.mysqlColumn,
        data_type: mapping.dataType,
        is_primary_key: mapping.isPrimaryKey || false,
    }));

    const { error: mappingsError } = await supabase
        .from('column_mappings')
        .insert(mappingsToInsert);

    if (mappingsError) {
        logger.error('Failed to create column mappings:', mappingsError);
        // Rollback integration
        await supabase.from('integrations').delete().eq('id', integrationId);
        throw new Error('Failed to create column mappings');
    }

    // Create sync state
    const { error: syncStateError } = await supabase
        .from('sync_state')
        .insert({
            integration_id: integrationId,
            last_sync_version: 0,
            conflict_resolution: request.conflictResolution || 'latest_wins',
        });

    if (syncStateError) {
        logger.error('Failed to create sync state:', syncStateError);
        // Rollback
        await supabase.from('column_mappings').delete().eq('integration_id', integrationId);
        await supabase.from('integrations').delete().eq('id', integrationId);
        throw new Error('Failed to create sync state');
    }

    // Update status to active
    await supabase
        .from('integrations')
        .update({ status: 'active' })
        .eq('id', integrationId);

    // Enqueue initial sync job
    await enqueueSyncJob({
        integrationId,
        tenantId,
        direction: request.syncDirection === 'mysql_to_sheets' ? 'mysql_to_sheets' : 'sheets_to_mysql',
        triggeredBy: 'initial',
    });

    logger.info(`Created integration ${integrationId} for tenant ${tenantId}`);

    return { ...integration, status: 'active' };
}

/**
 * Gets integration by ID
 */
export async function getIntegration(
    tenantId: string,
    integrationId: string
): Promise<Integration> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .eq('tenant_id', tenantId)
        .single();

    if (error || !data) {
        throw new NotFoundError('Integration');
    }

    return data;
}

/**
 * Lists integrations for tenant
 */
export async function listIntegrations(tenantId: string): Promise<Integration[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    if (error) {
        logger.error('Failed to list integrations:', error);
        throw new Error('Failed to list integrations');
    }

    return data || [];
}

/**
 * Gets column mappings for integration
 */
export async function getColumnMappings(integrationId: string): Promise<ColumnMapping[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('column_mappings')
        .select('*')
        .eq('integration_id', integrationId);

    if (error) {
        logger.error('Failed to get column mappings:', error);
        throw new Error('Failed to get column mappings');
    }

    return data || [];
}

/**
 * Gets sync state for integration
 */
export async function getSyncState(integrationId: string): Promise<SyncState | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('sync_state')
        .select('*')
        .eq('integration_id', integrationId)
        .single();

    if (error) {
        return null;
    }

    return data;
}

/**
 * Updates sync state
 */
export async function updateSyncState(
    integrationId: string,
    updates: Partial<SyncState>
): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('sync_state')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('integration_id', integrationId);

    if (error) {
        logger.error('Failed to update sync state:', error);
        throw new Error('Failed to update sync state');
    }
}

/**
 * Updates integration status
 */
export async function updateIntegrationStatus(
    integrationId: string,
    status: Integration['status']
): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('integrations')
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', integrationId);

    if (error) {
        logger.error('Failed to update integration status:', error);
        throw new Error('Failed to update integration status');
    }
}

/**
 * Updates last sync timestamp
 */
export async function updateLastSync(integrationId: string): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('integrations')
        .update({
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', integrationId);

    if (error) {
        logger.error('Failed to update last sync:', error);
    }
}

/**
 * Deletes integration and all related data
 */
export async function deleteIntegration(
    tenantId: string,
    integrationId: string
): Promise<void> {
    const supabase = getSupabaseAdmin();

    // Verify ownership
    const integration = await getIntegration(tenantId, integrationId);

    // Delete in order (foreign key constraints)
    await supabase.from('sync_logs').delete().eq('integration_id', integrationId);
    await supabase.from('sync_state').delete().eq('integration_id', integrationId);
    await supabase.from('column_mappings').delete().eq('integration_id', integrationId);

    const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', integrationId);

    if (error) {
        logger.error('Failed to delete integration:', error);
        throw new Error('Failed to delete integration');
    }

    logger.info(`Deleted integration ${integrationId}`);
}

/**
 * Pauses integration
 */
export async function pauseIntegration(
    tenantId: string,
    integrationId: string
): Promise<void> {
    await getIntegration(tenantId, integrationId); // Verify ownership
    await updateIntegrationStatus(integrationId, 'paused');
    logger.info(`Paused integration ${integrationId}`);
}

/**
 * Resumes integration
 */
export async function resumeIntegration(
    tenantId: string,
    integrationId: string
): Promise<void> {
    const integration = await getIntegration(tenantId, integrationId);
    await updateIntegrationStatus(integrationId, 'active');

    // Trigger sync on resume
    await enqueueSyncJob({
        integrationId,
        tenantId,
        direction: integration.sync_direction === 'mysql_to_sheets' ? 'mysql_to_sheets' : 'sheets_to_mysql',
        triggeredBy: 'manual',
    });

    logger.info(`Resumed integration ${integrationId}`);
}

/**
 * Triggers manual sync
 */
export async function triggerSync(
    tenantId: string,
    integrationId: string
): Promise<void> {
    const integration = await getIntegration(tenantId, integrationId);

    // Reset status to active if it was in error state (allows retry)
    if (integration.status === 'error' || integration.status === 'paused') {
        await updateIntegrationStatus(integrationId, 'active');
    }

    await enqueueSyncJob({
        integrationId,
        tenantId,
        direction: integration.sync_direction === 'mysql_to_sheets' ? 'mysql_to_sheets' : 'sheets_to_mysql',
        triggeredBy: 'manual',
    });

    logger.info(`Triggered manual sync for integration ${integrationId}`);
}
