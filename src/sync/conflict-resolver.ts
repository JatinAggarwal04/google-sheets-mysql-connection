import { ChangeEvent, eventsConflict, Conflict } from './change-event.js';
import { createComponentLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createComponentLogger('ConflictResolver');

/**
 * Conflict resolution strategy type
 */
export type ConflictStrategy = 'last-write-wins' | 'sheet-wins' | 'mysql-wins' | 'manual';

/**
 * Result of conflict resolution
 */
export interface ResolutionResult {
    /** The winning data */
    data: Record<string, unknown>;
    /** How it was resolved */
    strategy: ConflictStrategy;
    /** Which source won */
    winner: 'sheet' | 'mysql' | 'merged';
    /** Whether manual review is needed */
    requiresReview: boolean;
    /** Original conflict record */
    conflict: Conflict;
}

/**
 * Conflict resolver with configurable strategies
 */
export class ConflictResolver {
    private strategy: ConflictStrategy;
    private pendingConflicts: Map<string, Conflict> = new Map();

    constructor(strategy?: ConflictStrategy) {
        this.strategy = strategy ?? getConfig().sync.conflictStrategy;
        logger.info('Conflict resolver initialized', { strategy: this.strategy });
    }

    /**
     * Detect if two events conflict
     */
    detectConflict(a: ChangeEvent, b: ChangeEvent): Conflict | null {
        if (!eventsConflict(a, b)) {
            return null;
        }

        const conflict: Conflict = {
            id: uuidv4(),
            sheetEvent: a.origin === 'SHEET' ? a : b,
            mysqlEvent: a.origin === 'MYSQL' ? a : b,
            detectedAt: Date.now(),
            status: 'pending',
        };

        logger.warn('Conflict detected', {
            conflictId: conflict.id,
            rowId: a.rowId,
            sheetTimestamp: conflict.sheetEvent.timestamp,
            mysqlTimestamp: conflict.mysqlEvent.timestamp,
        });

        return conflict;
    }

    /**
     * Resolve a conflict based on the configured strategy
     */
    resolve(conflict: Conflict): ResolutionResult {
        const { sheetEvent, mysqlEvent } = conflict;

        let result: ResolutionResult;

        switch (this.strategy) {
            case 'last-write-wins':
                result = this.resolveLastWriteWins(conflict);
                break;

            case 'sheet-wins':
                result = this.resolveSourceWins(conflict, 'sheet');
                break;

            case 'mysql-wins':
                result = this.resolveSourceWins(conflict, 'mysql');
                break;

            case 'manual':
                result = this.queueForManualReview(conflict);
                break;

            default:
                result = this.resolveLastWriteWins(conflict);
        }

        logger.info('Conflict resolved', {
            conflictId: conflict.id,
            strategy: result.strategy,
            winner: result.winner,
            requiresReview: result.requiresReview,
        });

        return result;
    }

    /**
     * Last-write-wins resolution based on timestamps
     */
    private resolveLastWriteWins(conflict: Conflict): ResolutionResult {
        const { sheetEvent, mysqlEvent } = conflict;

        const sheetWins = sheetEvent.timestamp >= mysqlEvent.timestamp;
        const winningEvent = sheetWins ? sheetEvent : mysqlEvent;

        conflict.status = 'resolved';
        conflict.resolution = sheetWins ? 'sheet-wins' : 'mysql-wins';
        conflict.resolvedData = winningEvent.data;

        return {
            data: winningEvent.data,
            strategy: 'last-write-wins',
            winner: sheetWins ? 'sheet' : 'mysql',
            requiresReview: false,
            conflict,
        };
    }

    /**
     * Source-priority resolution (sheet or mysql always wins)
     */
    private resolveSourceWins(
        conflict: Conflict,
        source: 'sheet' | 'mysql'
    ): ResolutionResult {
        const winningEvent = source === 'sheet' ? conflict.sheetEvent : conflict.mysqlEvent;

        conflict.status = 'resolved';
        conflict.resolution = source === 'sheet' ? 'sheet-wins' : 'mysql-wins';
        conflict.resolvedData = winningEvent.data;

        return {
            data: winningEvent.data,
            strategy: source === 'sheet' ? 'sheet-wins' : 'mysql-wins',
            winner: source,
            requiresReview: false,
            conflict,
        };
    }

    /**
     * Queue conflict for manual review
     */
    private queueForManualReview(conflict: Conflict): ResolutionResult {
        conflict.status = 'pending';
        this.pendingConflicts.set(conflict.id, conflict);

        logger.warn('Conflict queued for manual review', {
            conflictId: conflict.id,
            pendingCount: this.pendingConflicts.size,
        });

        // Return the newer data temporarily, but mark for review
        const newerEvent =
            conflict.sheetEvent.timestamp >= conflict.mysqlEvent.timestamp
                ? conflict.sheetEvent
                : conflict.mysqlEvent;

        return {
            data: newerEvent.data,
            strategy: 'manual',
            winner: conflict.sheetEvent.timestamp >= conflict.mysqlEvent.timestamp ? 'sheet' : 'mysql',
            requiresReview: true,
            conflict,
        };
    }

    /**
     * Manually resolve a pending conflict
     */
    manuallyResolve(
        conflictId: string,
        resolution: 'sheet-wins' | 'mysql-wins',
        mergedData?: Record<string, unknown>
    ): ResolutionResult | null {
        const conflict = this.pendingConflicts.get(conflictId);

        if (!conflict) {
            logger.warn('Conflict not found for manual resolution', { conflictId });
            return null;
        }

        conflict.status = 'resolved';
        conflict.resolution = resolution;

        let data: Record<string, unknown>;
        let winner: 'sheet' | 'mysql' | 'merged';

        if (mergedData) {
            data = mergedData;
            winner = 'merged';
            conflict.resolution = 'merged';
        } else if (resolution === 'sheet-wins') {
            data = conflict.sheetEvent.data;
            winner = 'sheet';
        } else {
            data = conflict.mysqlEvent.data;
            winner = 'mysql';
        }

        conflict.resolvedData = data;
        this.pendingConflicts.delete(conflictId);

        logger.info('Conflict manually resolved', {
            conflictId,
            resolution,
            winner,
        });

        return {
            data,
            strategy: 'manual',
            winner,
            requiresReview: false,
            conflict,
        };
    }

    /**
     * Get all pending conflicts
     */
    getPendingConflicts(): Conflict[] {
        return Array.from(this.pendingConflicts.values());
    }

    /**
     * Get pending conflict count
     */
    getPendingCount(): number {
        return this.pendingConflicts.size;
    }

    /**
     * Clear resolved conflicts older than specified age
     */
    clearOldConflicts(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
        const cutoff = Date.now() - maxAgeMs;
        let cleared = 0;

        for (const [id, conflict] of this.pendingConflicts) {
            if (conflict.detectedAt < cutoff) {
                this.pendingConflicts.delete(id);
                cleared++;
            }
        }

        if (cleared > 0) {
            logger.info('Cleared old pending conflicts', { count: cleared });
        }

        return cleared;
    }
}

// Singleton instance
let conflictResolverInstance: ConflictResolver | null = null;

/**
 * Get the conflict resolver singleton
 */
export function getConflictResolver(): ConflictResolver {
    if (!conflictResolverInstance) {
        conflictResolverInstance = new ConflictResolver();
    }
    return conflictResolverInstance;
}
