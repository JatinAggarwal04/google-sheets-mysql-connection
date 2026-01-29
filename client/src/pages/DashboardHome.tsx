
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Database, FileSpreadsheet, ArrowRight, Loader } from 'lucide-react';
import { Header } from '../components/Header';
import '../index.css';

export default function DashboardHome() {
    const [connections, setConnections] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/connections')
            .then(res => res.json())
            .then(data => {
                setConnections(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="app bg-[#0f0f0f] min-h-screen text-white font-sans">
            <Header status="connected" statusText="Dashboard" />

            <main className="main max-w-6xl mx-auto pt-12 px-6">
                <div className="flex justify-between items-center mb-10 pb-6 border-b border-[#2a2a2a]">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">
                            My Connections
                        </h1>
                        <p className="text-gray-400 mt-1">Manage your Google Sheets ↔ MySQL integrations</p>
                    </div>
                    {connections.length > 0 && (
                        <Link
                            to="/wizard"
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            New Connection
                        </Link>
                    )}
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-32">
                        <Loader className="w-10 h-10 animate-spin text-blue-500" />
                    </div>
                ) : connections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl shadow-xl">
                        <div className="w-20 h-20 bg-[#252525] rounded-full flex items-center justify-center mb-6 ring-4 ring-[#1f1f1f]">
                            <FileSpreadsheet className="w-9 h-9 text-gray-400" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">No Google Sheets Connected</h3>
                        <p className="text-gray-400 max-w-lg text-center leading-relaxed mb-8">
                            You haven't linked any sheets yet. Connect a Google Sheet to automatically create a MySQL table and start sinking data in real-time.
                        </p>
                        <Link
                            to="/wizard"
                            className="group flex items-center gap-2 bg-white text-black hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg transition-all transform hover:-translate-y-1 shadow-xl"
                        >
                            Connect Google Sheet
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {connections.map(conn => (
                            <Link
                                key={conn.id}
                                to={`/connection/${conn.id}`}
                                className="group block bg-[#1e1e1e] border border-[#2a2a2a] hover:border-blue-500 rounded-xl overflow-hidden transition-all hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1"
                            >
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`p-3 rounded-lg ${conn.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-gray-700/20 text-gray-400'}`}>
                                            <Database className="w-6 h-6" />
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide ${conn.status === 'active'
                                                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                                : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                            }`}>
                                            {conn.status}
                                        </span>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors truncate">
                                        {conn.name}
                                    </h3>

                                    <div className="space-y-2 mt-4 pt-4 border-t border-[#2a2a2a]">
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <FileSpreadsheet className="w-4 h-4 text-gray-500" />
                                            <span className="truncate">{conn.sheetName}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <Database className="w-4 h-4 text-gray-500" />
                                            <span className="font-mono text-xs text-gray-500">{conn.mysqlTableName}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-[#252525] px-6 py-3 border-t border-[#2a2a2a] flex justify-between items-center text-sm text-gray-400 group-hover:bg-[#2a2a2a] transition-colors">
                                    <span>View Details</span>
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
