/**
 * Change event types for the sync engine
 */

/**
 * Origin of a change - either from Google Sheets or MySQL
 */
export const ChangeOrigin = {
    SHEET: 'SHEET',
    MYSQL: 'MYSQL',
} as const;

export type ChangeOriginType = typeof ChangeOrigin[keyof typeof ChangeOrigin];

/**
 * Type of operation performed
 */
export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * A single change event from either source
 */
export interface ChangeEvent {
    /** Unique identifier for this event */
    id: string;

    /** Origin of the change (SHEET or MYSQL) */
    origin: ChangeOriginType;

    /** Type of operation */
    operation: OperationType;

    /** Target table name in MySQL */
    tableName: string;

    /** Row identifier (row number for sheets, ID for MySQL) */
    rowId: string | number;

    /** The new/current data */
    data: Record<string, unknown>;

    /** Previous data (for updates) */
    previousData?: Record<string, unknown>;

    /** Timestamp of the change (milliseconds since epoch) */
    timestamp: number;

    /** User who made the change (for multiplayer) */
    userId?: string;

    /** Specific columns that changed (for partial updates) */
    changedColumns?: string[];

    /** Sheet cell range for sheet changes (e.g., "A2:C2") */
    sheetRange?: string;
}

/**
 * A conflict between Sheet and MySQL changes
 */
export interface Conflict {
    /** Unique identifier for this conflict */
    id: string;

    /** The Sheet change event */
    sheetEvent: ChangeEvent;

    /** The MySQL change event */
    mysqlEvent: ChangeEvent;

    /** When the conflict was detected */
    detectedAt: number;

    /** Resolution status */
    status: 'pending' | 'resolved' | 'ignored';

    /** How it was resolved (if resolved) */
    resolution?: 'sheet-wins' | 'mysql-wins' | 'merged' | 'manual';

    /** The winning value (if resolved) */
    resolvedData?: Record<string, unknown>;
}

/**
 * Batch of changes from rapid edits (for multiplayer debouncing)
 */
export interface ChangeBatch {
    /** Unique identifier for this batch */
    id: string;

    /** All events in this batch */
    events: ChangeEvent[];

    /** When the batch started */
    startedAt: number;

    /** When the batch was finalized */
    finalizedAt?: number;

    /** User who made the changes */
    userId: string;
}

/**
 * Sync status for dashboard display
 */
export interface SyncStatus {
    /** Whether sync is currently running */
    isRunning: boolean;

    /** Last successful sync time */
    lastSyncAt?: number;

    /** Number of pending changes in queue */
    pendingChanges: number;

    /** Number of unresolved conflicts */
    unresolvedConflicts: number;

    /** Current operation (if syncing) */
    currentOperation?: string;

    /** Error message (if any) */
    error?: string;
}

/**
 * Create a new change event
 */
export function createChangeEvent(
    origin: ChangeOriginType,
    operation: OperationType,
    tableName: string,
    rowId: string | number,
    data: Record<string, unknown>,
    options?: Partial<Pick<ChangeEvent, 'previousData' | 'userId' | 'changedColumns' | 'sheetRange'>>
): ChangeEvent {
    return {
        id: crypto.randomUUID(),
        origin,
        operation,
        tableName,
        rowId,
        data,
        timestamp: Date.now(),
        ...options,
    };
}

/**
 * Check if two change events conflict
 */
export function eventsConflict(a: ChangeEvent, b: ChangeEvent): boolean {
    // Different rows don't conflict
    if (a.rowId !== b.rowId) return false;

    // Same origin doesn't conflict (shouldn't happen in normal flow)
    if (a.origin === b.origin) return false;

    // If both have changedColumns, check for overlap
    if (a.changedColumns && b.changedColumns) {
        const aColumns = new Set(a.changedColumns);
        return b.changedColumns.some(col => aColumns.has(col));
    }

    // Without specific columns, assume full row conflict
    return true;
}
