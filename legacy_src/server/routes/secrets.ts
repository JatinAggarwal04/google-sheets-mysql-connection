import { Router, Request, Response } from 'express';
import { getConnectionManager } from '../../mysql/connection-manager.js';
import { createComponentLogger } from '../../utils/logger.js';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const logger = createComponentLogger('SecretsRoute');
export const secretsRouter = Router();

const connectionManager = getConnectionManager();

// Validate input
const createSecretSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['google_sa', 'mysql_creds']),
    value: z.string().min(1)
});

// Protect all routes
secretsRouter.use(requireAuth);

/**
 * GET /api/secrets
 * List secrets for the authenticated user
 */
secretsRouter.get('/', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const secrets = await connectionManager.getSecrets(req.user.id);
        res.json(secrets);
    } catch (error) {
        logger.error('Failed to list secrets', { error });
        res.status(500).json({ error: 'Failed to list secrets' });
    }
});

/**
 * POST /api/secrets
 * Create a new encrypted secret
 */
secretsRouter.post('/', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const { name, type, value } = createSecretSchema.parse(req.body);

        const id = await connectionManager.createSecret(req.user.id, name, type, value);

        res.status(201).json({
            success: true,
            id,
            message: 'Secret stored safely'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation error', details: error.errors });
            return;
        }
        logger.error('Failed to create secret', { error });
        res.status(500).json({ error: 'Failed to create secret' });
    }
});

/**
 * DELETE /api/secrets/:id
 * Delete a secret
 */
secretsRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        if (!req.user) return;
        const id = parseInt(req.params['id'] || '0', 10);

        await connectionManager.deleteSecret(req.user.id, id);

        res.json({ success: true, message: 'Secret deleted' });
    } catch (error) {
        logger.error('Failed to delete secret', { error });
        res.status(500).json({ error: 'Failed to delete secret' });
    }
});
