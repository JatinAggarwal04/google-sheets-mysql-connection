import React from 'react';

interface StatusDashboardProps {
    syncStatus: string;
    pendingChanges: number;
    conflictCount: number;
    lastSync: string;
    eventLog: Array<{ type: string; message: string; timestamp: string }>;
    onTriggerSync: () => void;
    onRefresh: () => void;
    onClearLog: () => void;
}

export const StatusDashboard: React.FC<StatusDashboardProps> = ({
    syncStatus,
    pendingChanges,
    conflictCount,
    lastSync,
    eventLog,
    onTriggerSync,
    onRefresh,
    onClearLog
}) => {
    return (
        <section className="tab-content active">
            {/* Status Cards */}
            <section className="status-cards">
                <div className="card status-card">
                    <div className="card-icon sync-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                        </svg>
                    </div>
                    <div className="card-content">
                        <h3>Sync Status</h3>
                        <p className="card-value">{syncStatus}</p>
                    </div>
                </div>

                <div className="card status-card">
                    <div className="card-icon queue-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                    </div>
                    <div className="card-content">
                        <h3>Pending Changes</h3>
                        <p className="card-value">{pendingChanges}</p>
                    </div>
                </div>

                <div className="card status-card">
                    <div className="card-icon conflict-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>
                    <div className="card-content">
                        <h3>Conflicts</h3>
                        <p className="card-value">{conflictCount}</p>
                    </div>
                </div>

                <div className="card status-card">
                    <div className="card-icon time-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>
                    <div className="card-content">
                        <h3>Last Sync</h3>
                        <p className="card-value">{lastSync}</p>
                    </div>
                </div>
            </section>

            {/* Actions */}
            <section className="actions-section">
                <h2>Actions</h2>
                <div className="actions">
                    <button className="btn btn-primary" onClick={onTriggerSync}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Trigger Full Sync
                    </button>
                    <button className="btn btn-secondary" onClick={onRefresh}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1 4 1 10 7 10" />
                            <polyline points="23 20 23 14 17 14" />
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                        </svg>
                        Refresh Status
                    </button>
                </div>
            </section>

            {/* Event Log */}
            <section className="log-section">
                <div className="log-header">
                    <h2>Event Log</h2>
                    <button className="btn btn-ghost" onClick={onClearLog}>Clear</button>
                </div>
                <div className="log-container">
                    {eventLog.length === 0 ? (
                        <div className="log-empty">
                            <p>Waiting for events...</p>
                        </div>
                    ) : (
                        eventLog.map((log, index) => (
                            <div key={index} className="log-entry">
                                <span className="log-time">{log.timestamp}</span>
                                <span className={`log-type ${log.type.toLowerCase()}`}>{log.type}</span>
                                <span className="log-message" dangerouslySetInnerHTML={{ __html: log.message }}></span>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </section>
    );
};
