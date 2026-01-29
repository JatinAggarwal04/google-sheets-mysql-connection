// ===========================================
// Queue Service (BullMQ)
// ===========================================

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import { logger } from '../lib/logger.js';
import type { SyncJobPayload } from '../types/api.js';

const SYNC_QUEUE_NAME = 'sync-jobs';

let syncQueue: Queue<SyncJobPayload> | null = null;
let syncWorker: Worker<SyncJobPayload> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Gets or creates the sync queue
 */
export function getSyncQueue(): Queue<SyncJobPayload> {
    if (syncQueue) return syncQueue;

    const connection = createBullMQConnection();

    syncQueue = new Queue<SyncJobPayload>(SYNC_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            removeOnComplete: {
                age: 24 * 3600, // Keep completed jobs for 24 hours
                count: 1000,
            },
            removeOnFail: {
                age: 7 * 24 * 3600, // Keep failed jobs for 7 days
            },
        },
    });

    return syncQueue;
}

/**
 * Enqueues a sync job
 */
export async function enqueueSyncJob(payload: SyncJobPayload): Promise<Job<SyncJobPayload>> {
    const queue = getSyncQueue();

    const job = await queue.add(`sync-${payload.integrationId}`, payload, {
        jobId: `sync-${payload.integrationId}-${Date.now()}`,
    });

    logger.info(`Enqueued sync job ${job.id} for integration ${payload.integrationId}`);

    return job;
}

/**
 * Starts the sync worker
 */
export function startSyncWorker(
    processor: (job: Job<SyncJobPayload>) => Promise<void>
): Worker<SyncJobPayload> {
    if (syncWorker) {
        return syncWorker;
    }

    const connection = createBullMQConnection();

    syncWorker = new Worker<SyncJobPayload>(
        SYNC_QUEUE_NAME,
        processor,
        {
            connection,
            concurrency: 5,
            limiter: {
                max: 10,
                duration: 1000,
            },
        }
    );

    syncWorker.on('completed', (job) => {
        logger.info(`Sync job ${job.id} completed`);
    });

    syncWorker.on('failed', (job, err) => {
        logger.error(`Sync job ${job?.id} failed:`, err);
    });

    syncWorker.on('error', (err) => {
        logger.error('Worker error:', err);
    });

    logger.info('Sync worker started');

    return syncWorker;
}

/**
 * Gets queue events for monitoring
 */
export function getQueueEvents(): QueueEvents {
    if (queueEvents) return queueEvents;

    const connection = createBullMQConnection();

    queueEvents = new QueueEvents(SYNC_QUEUE_NAME, {
        connection,
    });

    return queueEvents;
}

/**
 * Gets queue status
 */
export async function getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}> {
    const queue = getSyncQueue();

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
}

/**
 * Gets jobs for an integration
 */
export async function getIntegrationJobs(
    integrationId: string,
    status: 'completed' | 'failed' | 'waiting' | 'active' = 'completed'
): Promise<Job<SyncJobPayload>[]> {
    const queue = getSyncQueue();

    let jobs: Job<SyncJobPayload>[];

    switch (status) {
        case 'completed':
            jobs = await queue.getCompleted(0, 50);
            break;
        case 'failed':
            jobs = await queue.getFailed(0, 50);
            break;
        case 'waiting':
            jobs = await queue.getWaiting(0, 50);
            break;
        case 'active':
            jobs = await queue.getActive(0, 50);
            break;
    }

    return jobs.filter((job) => job.data.integrationId === integrationId);
}

/**
 * Retries a failed job
 */
export async function retryJob(jobId: string): Promise<void> {
    const queue = getSyncQueue();
    const job = await queue.getJob(jobId);

    if (job) {
        await job.retry();
        logger.info(`Retried job ${jobId}`);
    }
}

/**
 * Cleans up old jobs
 */
export async function cleanupJobs(): Promise<void> {
    const queue = getSyncQueue();

    await queue.clean(24 * 3600 * 1000, 1000, 'completed');
    await queue.clean(7 * 24 * 3600 * 1000, 1000, 'failed');

    logger.info('Cleaned up old jobs');
}

/**
 * Graceful shutdown
 */
export async function shutdownQueue(): Promise<void> {
    if (syncWorker) {
        await syncWorker.close();
        syncWorker = null;
    }

    if (queueEvents) {
        await queueEvents.close();
        queueEvents = null;
    }

    if (syncQueue) {
        await syncQueue.close();
        syncQueue = null;
    }

    logger.info('Queue shutdown complete');
}
