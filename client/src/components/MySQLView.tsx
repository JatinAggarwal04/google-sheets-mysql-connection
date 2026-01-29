import React from 'react';

interface MySQLViewProps {
    data: any[];
    headers: string[];
    isLoading: boolean;
    onAddRow: () => void;
    onRefresh: () => void;
}

export const MySQLView: React.FC<MySQLViewProps> = ({ data, headers, isLoading, onAddRow, onRefresh }) => {
    return (
        <section className="tab-content active">
            <div className="data-header">
                <h2>MySQL Data</h2>
                <div className="data-actions">
                    <button className="btn btn-primary" onClick={onAddRow}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Row
                    </button>
                    <button className="btn btn-secondary" onClick={onRefresh}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Refresh
                    </button>
                </div>
            </div>
            <div className="data-table-container">
                {isLoading ? (
                    <div className="loading">Loading data...</div>
                ) : data.length === 0 ? (
                    <div className="table-empty">No data found</div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                {headers.map((header) => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i}>
                                    {headers.map((header) => (
                                        <td key={`${i}-${header}`}>{String(row[header] ?? '')}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
};
