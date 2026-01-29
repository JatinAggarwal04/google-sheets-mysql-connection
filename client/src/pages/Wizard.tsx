
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Header } from '../components/Header';
import { ArrowRight, Loader2, Database, FileSpreadsheet, AlertCircle } from 'lucide-react';
import '../index.css';

export default function Wizard() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        spreadsheetId: '',
        sheetName: 'Sheet1',
        mysqlTableName: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });

        // Auto-generate safe table name from connection name
        if (e.target.name === 'name' && !formData.mysqlTableName) {
            setFormData(prev => ({
                ...prev,
                name: e.target.value,
                mysqlTableName: 'sync_' + e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_')
            }));
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const payload = {
                ...formData,
                columnMapping: {} // Empty = Auto-infer from headers
            };

            const res = await fetch('/api/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create connection');
            }

            navigate(`/connection/${data.id}`);

        } catch (err: any) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="app min-h-screen bg-[#0f0f0f] text-white font-sans">
            <Header status="connected" statusText="System Ready" />

            <main className="main max-w-3xl mx-auto pt-16 px-6">
                <div className="mb-12 text-center">
                    <h2 className="text-4xl font-bold text-white mb-3">
                        Connect Google Sheet
                    </h2>
                    <p className="text-gray-400 text-lg">Link an existing Google Sheet to a new MySQL table.</p>
                </div>

                <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-10 shadow-2xl">
                    <motion.form
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        onSubmit={handleCreate}
                        className="space-y-8"
                    >
                        {/* Name Input */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider">
                                Connection Name
                            </label>
                            <input
                                name="name"
                                type="text"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="e.g. Q1 Sales Data"
                                className="w-full bg-[#0f0f0f] border border-[#333] rounded-lg px-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-lg"
                            />
                        </div>

                        {/* Spreadsheet ID */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider">
                                    Google Sheet ID
                                </label>
                                <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium hover:underline transition-all">
                                    Open Google Sheets <ArrowRight className="w-3 h-3" />
                                </a>
                            </div>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <FileSpreadsheet className="h-5 w-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                                </div>
                                <input
                                    name="spreadsheetId"
                                    type="text"
                                    required
                                    value={formData.spreadsheetId}
                                    onChange={handleChange}
                                    placeholder="Paste ID from URL: 1BxiMVs0XRA..."
                                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-lg pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                                />
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1 bg-[#252525] p-2 rounded border border-[#333] mt-2">
                                <span className="text-gray-400">Hint:</span>
                                docs.google.com/spreadsheets/d/<span className="text-blue-400 font-mono">1BxiMVs0XRA...</span>/edit
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Sheet Name */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider">
                                    Sheet Tab Name
                                </label>
                                <input
                                    name="sheetName"
                                    type="text"
                                    required
                                    value={formData.sheetName}
                                    onChange={handleChange}
                                    placeholder="Sheet1"
                                    className="w-full bg-[#0f0f0f] border border-[#333] rounded-lg px-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                />
                            </div>

                            {/* MySQL Table */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider">
                                    MySQL Table Name
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Database className="h-5 w-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <input
                                        name="mysqlTableName"
                                        type="text"
                                        required
                                        value={formData.mysqlTableName}
                                        onChange={handleChange}
                                        placeholder="sync_table_name"
                                        className="w-full bg-[#0f0f0f] border border-[#333] rounded-lg pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-3 animate-pulse">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="pt-8 border-t border-[#333] flex items-center gap-4">
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="px-8 py-4 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-[#252525] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`flex-1 flex justify-center items-center gap-2 px-8 py-4 rounded-lg font-bold text-lg transition-all ${isLoading
                                        ? 'bg-[#252525] text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 active:scale-95'
                                    }`}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        Link & Import Data
                                        <ArrowRight className="w-6 h-6" />
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.form>
                </div>
            </main>
        </div>
    );
}
