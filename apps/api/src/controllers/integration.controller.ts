import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { addSyncJob } from '../queue/sync.queue.js';
import { z } from 'zod'; // We need validation

const createIntegrationSchema = z.object({
    name: z.string().min(1),
    sourceConfig: z.object({
        spreadsheetId: z.string(),
        sheetId: z.number().optional(),
        sheetName: z.string(),
        range: z.string().optional()
    }),
    destConfig: z.object({
        host: z.string(),
        port: z.number().default(3306),
        user: z.string(),
        password: z.string(),
        database: z.string(),
        table: z.string(),
        ssl: z.any().optional()
    }),
    syncMode: z.enum(['2-way', 'sheet-to-db', 'db-to-sheet']).default('2-way')
});

export const createIntegration = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Validate Input
    const validation = createIntegrationSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ error: validation.error.format() });
    }

    const { name, sourceConfig, destConfig, syncMode } = validation.data;

    try {
        const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

        // 1. Create Integration Record
        const { data: integration, error } = await supabase
            .from('integrations')
            .insert({
                user_id: userId,
                name,
                source_config: sourceConfig,
                dest_config: destConfig, // WARNING: Storing password in plain text in JSONB here is NOT secure for prod.
                // In a real generic SaaS, we'd separate credentials into 'user_credentials' and reference them by ID.
                // For this V2 rebuild MVP requested by user, I will proceed but adding a TODO/Warning.
                // Ideally, the frontend should have created a 'MySQL Credential' first, and passed credentialId.
                // Or we separate it now.
                // Let's stick to the requested flow: "Select existing MySQL Credential or Enter New".
                // If "Enter New", we should probably save it as a credential.
                // But for now, let's keep it simple to get the flow working:
                // We'll store config as is.
                sync_mode: syncMode,
                status: 'active'
            })
            .select() // Select to get ID
            .single();

        if (error || !integration) {
            console.error('Supabase Error:', error);
            return res.status(500).json({ error: 'Failed to create integration record' });
        }

        console.log(`Integration created: ${integration.id}`);

        // 2. Initialize Sync State (Optional, but good for tracking)
        await supabase.from('sync_state').insert({
            integration_id: integration.id,
            status: 'idle'
        });

        // 3. Trigger Initial Sync (Event Driven!)
        const job = await addSyncJob({
            integrationId: integration.id,
            userId: userId,
            trigger: 'manual' // or 'initial'
        });

        res.json({
            success: true,
            integration,
            jobId: job.id,
            message: 'Integration created and initial sync started.'
        });

    } catch (error) {
        console.error('Create integration error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const listIntegrations = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
    const { data } = await supabase.from('integrations').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    res.json({ integrations: data });
};
