import { ChangeEvent } from './change-event.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('ChangeQueue');

/**
 * Priority queue entry
 */
interface QueueEntry {
    event: ChangeEvent;
    priority: number;
    addedAt: number;
}

/**
 * Change queue with deduplication and priority support
 */
export class ChangeQueue {
    private queue: QueueEntry[] = [];
    private processing = false;
    private readonly maxSize: number;

    // Deduplication map: key is "origin:tableName:rowId"
    private dedupeMap: Map<string, number> = new Map();

    constructor(maxSize: number = 10000) {
        this.maxSize = maxSize;
    }

    /**
     * Create deduplication key for an event
     */
    private createDedupeKey(event: ChangeEvent): string {
        return `${event.origin}:${event.tableName}:${event.rowId}`;
    }

    /**
     * Add an event to the queue with deduplication
     */
    enqueue(event: ChangeEvent, priority: number = 0): boolean {
        if (this.queue.length >= this.maxSize) {
            logger.warn('Queue is full, dropping event', {
                eventId: event.id,
                queueSize: this.queue.length,
            });
            return false;
        }

        const dedupeKey = this.createDedupeKey(event);
        const existingIndex = this.dedupeMap.get(dedupeKey);

        if (existingIndex !== undefined) {
            // Update existing entry with newer event
            const existing = this.queue[existingIndex];
            if (existing && event.timestamp > existing.event.timestamp) {
                this.queue[existingIndex] = {
                    event,
                    priority,
                    addedAt: Date.now(),
                };
                logger.debug('Deduplicated event in queue', {
                    dedupeKey,
                    oldTimestamp: existing.event.timestamp,
                    newTimestamp: event.timestamp,
                });
            }
            return true;
        }

        // Add new entry
        const entry: QueueEntry = {
            event,
            priority,
            addedAt: Date.now(),
        };

        this.queue.push(entry);
        this.dedupeMap.set(dedupeKey, this.queue.length - 1);

        // Sort by priority (higher first), then by timestamp (older first)
        this.sortQueue();

        logger.debug('Event enqueued', {
            eventId: event.id,
            queueSize: this.queue.length,
            priority,
        });

        return true;
    }

    /**
     * Sort queue by priority and timestamp
     */
    private sortQueue(): void {
        this.queue.sort((a, b) => {
            // Higher priority first
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            // Older events first (FIFO within same priority)
            return a.event.timestamp - b.event.timestamp;
        });

        // Rebuild dedupe map after sort
        this.dedupeMap.clear();
        this.queue.forEach((entry, index) => {
            this.dedupeMap.set(this.createDedupeKey(entry.event), index);
        });
    }

    /**
     * Get the next event without removing it
     */
    peek(): ChangeEvent | null {
        return this.queue[0]?.event ?? null;
    }

    /**
     * Remove and return the next event
     */
    dequeue(): ChangeEvent | null {
        const entry = this.queue.shift();
        if (!entry) {
            return null;
        }

        // Update dedupe map
        this.dedupeMap.delete(this.createDedupeKey(entry.event));

        // Rebuild indices (expensive but necessary for correctness)
        this.dedupeMap.clear();
        this.queue.forEach((e, index) => {
            this.dedupeMap.set(this.createDedupeKey(e.event), index);
        });

        return entry.event;
    }

    /**
     * Dequeue up to N events as a batch
     */
    dequeueBatch(maxCount: number): ChangeEvent[] {
        const batch: ChangeEvent[] = [];

        for (let i = 0; i < maxCount && this.queue.length > 0; i++) {
            const event = this.dequeue();
            if (event) {
                batch.push(event);
            }
        }

        if (batch.length > 0) {
            logger.debug('Batch dequeued', { batchSize: batch.length });
        }

        return batch;
    }

    /**
     * Get current queue size
     */
    size(): number {
        return this.queue.length;
    }

    /**
     * Check if queue is empty
     */
    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * Clear all events from the queue
     */
    clear(): void {
        const previousSize = this.queue.length;
        this.queue = [];
        this.dedupeMap.clear();

        if (previousSize > 0) {
            logger.info('Queue cleared', { previousSize });
        }
    }

    /**
     * Get events for a specific row (for conflict detection)
     */
    getEventsForRow(tableName: string, rowId: string | number): ChangeEvent[] {
        return this.queue
            .filter(entry =>
                entry.event.tableName === tableName &&
                entry.event.rowId === rowId
            )
            .map(entry => entry.event);
    }

    /**
     * Remove all events for a specific row
     */
    removeEventsForRow(tableName: string, rowId: string | number): number {
        const initialSize = this.queue.length;

        this.queue = this.queue.filter(entry =>
            !(entry.event.tableName === tableName && entry.event.rowId === rowId)
        );

        // Rebuild dedupe map
        this.dedupeMap.clear();
        this.queue.forEach((entry, index) => {
            this.dedupeMap.set(this.createDedupeKey(entry.event), index);
        });

        const removed = initialSize - this.queue.length;
        if (removed > 0) {
            logger.debug('Events removed for row', { tableName, rowId, removed });
        }

        return removed;
    }

    /**
     * Get queue statistics
     */
    getStats(): {
        size: number;
        oldestEventAge: number | null;
        eventsByOrigin: Record<string, number>;
        eventsByOperation: Record<string, number>;
    } {
        const now = Date.now();
        const eventsByOrigin: Record<string, number> = {};
        const eventsByOperation: Record<string, number> = {};
        let oldestEventAge: number | null = null;

        for (const entry of this.queue) {
            // Count by origin
            eventsByOrigin[entry.event.origin] =
                (eventsByOrigin[entry.event.origin] ?? 0) + 1;

            // Count by operation
            eventsByOperation[entry.event.operation] =
                (eventsByOperation[entry.event.operation] ?? 0) + 1;

            // Track oldest
            const age = now - entry.event.timestamp;
            if (oldestEventAge === null || age > oldestEventAge) {
                oldestEventAge = age;
            }
        }

        return {
            size: this.queue.length,
            oldestEventAge,
            eventsByOrigin,
            eventsByOperation,
        };
    }
}

// Singleton instance
let changeQueueInstance: ChangeQueue | null = null;

/**
 * Get the change queue singleton
 */
export function getChangeQueue(): ChangeQueue {
    if (!changeQueueInstance) {
        changeQueueInstance = new ChangeQueue();
    }
    return changeQueueInstance;
}
