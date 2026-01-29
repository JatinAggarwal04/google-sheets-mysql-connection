import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { getConfig } from '../../config/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import { AuthenticationError, ValidationError } from '../../utils/errors.js';
import { getSyncEngine } from '../../sync/sync-engine.js';

const logger = createComponentLogger('WebhookRoute');

export const webhookRouter = Router();

/**
 * Schema for incoming Sheet change webhook
 */
const sheetChangeSchema = z.object({
    sheetName: z.string(),
    row: z.number().int().positive(),
    column: z.number().int().positive().optional(),
    numRows: z.number().int().positive().optional(),
    numColumns: z.number().int().positive().optional(),
    a1Notation: z.string().optional(),
    oldValue: z.unknown().optional(),
    newValue: z.unknown().optional(),
    operationType: z.string(),
    editedBy: z.string().optional(),
    timestamp: z.string(),
    headers: z.array(z.string()).optional(),
    rowData: z.record(z.unknown()).optional(),
    values: z.array(z.array(z.unknown())).optional(),
});

/**
 * Verify HMAC signature from Apps Script
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

/**
 * Authentication middleware for webhook
 */
function authenticateWebhook(req: Request, res: Response, next: () => void): void {
    const config = getConfig();
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    const timestamp = req.headers['x-timestamp'] as string | undefined;

    if (!signature) {
        throw new AuthenticationError('Missing webhook signature');
    }

    // Verify timestamp to prevent replay attacks (5 minute window)
    if (timestamp) {
        const requestTime = parseInt(timestamp, 10);
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
            throw new AuthenticationError('Request timestamp expired or invalid');
        }
    }

    // Verify signature
    const payload = JSON.stringify(req.body);

    if (!verifySignature(payload, signature, config.security.webhookSecret)) {
        logger.warn('Invalid webhook signature', {
            ip: req.ip,
        });
        throw new AuthenticationError('Invalid webhook signature');
    }

    next();
}

/**
 * POST /api/webhook/sheets
 * Receive change events from Google Apps Script
 */
webhookRouter.post('/sheets', (req: Request, res: Response, next: () => void) => {
    try {
        authenticateWebhook(req, res, next);
    } catch (error) {
        res.status(401).json({
            error: {
                code: 'AUTHENTICATION_FAILED',
                message: error instanceof Error ? error.message : 'Authentication failed',
            },
        });
    }
}, async (req: Request, res: Response) => {
    try {
        // Validate request body
        const parsed = sheetChangeSchema.safeParse(req.body);

        if (!parsed.success) {
            throw new ValidationError('Invalid webhook payload', {
                errors: parsed.error.errors,
            });
        }

        const changeData = parsed.data;

        logger.info('Webhook received', {
            sheetName: changeData.sheetName,
            row: changeData.row,
            operation: changeData.operationType,
            editedBy: changeData.editedBy,
        });

        // Process the change asynchronously  
        const syncEngine = getSyncEngine();

        const changePayload: {
            row: number;
            column: number;
            operationType: string;
            rowData?: Record<string, unknown>;
            oldValue?: unknown;
            newValue?: unknown;
            editedBy?: string;
        } = {
            row: changeData.row,
            column: changeData.column ?? 1,
            operationType: changeData.operationType,
        };

        if (changeData.rowData) {
            changePayload.rowData = changeData.rowData;
        }
        if (changeData.oldValue !== undefined) {
            changePayload.oldValue = changeData.oldValue;
        }
        if (changeData.newValue !== undefined) {
            changePayload.newValue = changeData.newValue;
        }
        if (changeData.editedBy) {
            changePayload.editedBy = changeData.editedBy;
        }

        syncEngine.handleSheetChange(changePayload);

        // Acknowledge immediately
        res.status(202).json({
            success: true,
            message: 'Change queued for processing',
        });

    } catch (error) {
        logger.error('Webhook processing error', { error });

        if (error instanceof ValidationError) {
            res.status(400).json(error.toJSON());
            return;
        }

        res.status(500).json({
            error: {
                code: 'WEBHOOK_ERROR',
                message: 'Failed to process webhook',
            },
        });
    }
});

/**
 * POST /api/webhook/test
 * Test endpoint for verifying webhook connectivity (no auth required in dev)
 */
webhookRouter.post('/test', (req: Request, res: Response) => {
    logger.info('Test webhook received', { body: req.body });

    res.json({
        success: true,
        message: 'Test webhook received',
        receivedAt: new Date().toISOString(),
        body: req.body,
    });
});
