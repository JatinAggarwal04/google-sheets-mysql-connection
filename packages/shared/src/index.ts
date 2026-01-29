export const SHARED_CONSTANTS = {
    APP_NAME: 'Google Sheets MySQL Sync',
    VERSION: '2.0.0'
} as const;

export type SyncStatus = 'active' | 'paused' | 'error';
