// ===========================================
// Layout Component
// ===========================================

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import {
    LayoutDashboard,
    Link2,
    LogOut,
    Database,
    Sheet,
    Plus,
} from 'lucide-react';
import './Layout.css';

export function Layout() {
    const location = useLocation();
    const { user, logout } = useAuthStore();

    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/integrations/new', label: 'Add Integration', icon: Plus },
        { path: '/connections', label: 'Connections', icon: Link2 },
    ];

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="layout">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo">
                        <div className="logo-icon">
                            <Sheet size={20} />
                            <Database size={16} className="logo-icon-overlay" />
                        </div>
                        <span className="logo-text">SyncHub</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-details">
                            <span className="user-email truncate">{user?.email}</span>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={logout} title="Logout">
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
