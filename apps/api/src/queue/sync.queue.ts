import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

export const SYNC_QUEUE_NAME = 'sync-jobs';

export interface SyncJobData {
    integrationId: string;
    userId: string;
    trigger: 'manual' | 'scheduled' | 'webhook';
}

let syncQueue: Queue<SyncJobData> | null = null;

export const getSyncQueue = (): Queue<SyncJobData> => {
    if (!syncQueue) {
        syncQueue = new Queue(SYNC_QUEUE_NAME, {
            connection: getRedisConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: 100, // Keep last 100 completed jobs
                removeOnFail: 200,     // Keep last 200 failed jobs
            },
        });
    }
    return syncQueue;
};

/**
 * Helper to add a sync job
 */
export const addSyncJob = async (data: SyncJobData) => {
    const queue = getSyncQueue();
    // Use integrationId as jobId to prevent duplicate queued jobs for same integration
    // If a job is already waiting or active, this might simply return the existing job or update it if deduplication logic is added
    // For now, simple add.
    return queue.add('sync', data, {
        jobId: `sync-${data.integrationId}-${Date.now()}` // Unique ID for now
    });
};
