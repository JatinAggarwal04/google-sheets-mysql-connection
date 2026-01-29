// ===========================================
// Tenant Service
// ===========================================

import { getSupabaseAdmin } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';
import type { Tenant } from '../types/database.js';

/**
 * Creates or gets tenant for a user
 */
export async function getOrCreateTenant(
    userId: string,
    email: string,
    name?: string
): Promise<Tenant> {
    const supabase = getSupabaseAdmin();

    // Check if tenant exists
    const { data: existing } = await supabase
        .from('tenants')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (existing) {
        return existing;
    }

    // Create new tenant
    const { data, error } = await supabase
        .from('tenants')
        .insert({
            user_id: userId,
            email,
            name,
        })
        .select()
        .single();

    if (error) {
        logger.error('Failed to create tenant:', error);
        throw new Error('Failed to create tenant');
    }

    logger.info(`Created tenant ${data.id} for user ${userId}`);
    return data;
}

/**
 * Gets tenant by user ID
 */
export async function getTenantByUserId(userId: string): Promise<Tenant> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        throw new NotFoundError('Tenant');
    }

    return data;
}

/**
 * Gets tenant by ID
 */
export async function getTenantById(tenantId: string): Promise<Tenant> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

    if (error || !data) {
        throw new NotFoundError('Tenant');
    }

    return data;
}

/**
 * Updates tenant
 */
export async function updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, 'name' | 'email'>>
): Promise<Tenant> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('tenants')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId)
        .select()
        .single();

    if (error || !data) {
        logger.error('Failed to update tenant:', error);
        throw new Error('Failed to update tenant');
    }

    return data;
}

/**
 * Deletes tenant and all related data
 */
export async function deleteTenant(tenantId: string): Promise<void> {
    const supabase = getSupabaseAdmin();

    // This should cascade through foreign keys in the database
    const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

    if (error) {
        logger.error('Failed to delete tenant:', error);
        throw new Error('Failed to delete tenant');
    }

    logger.info(`Deleted tenant ${tenantId}`);
}
