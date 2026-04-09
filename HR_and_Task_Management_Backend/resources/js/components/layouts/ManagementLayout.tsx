import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard, Users, ClipboardList,
    Clock, BarChart2, LogOut, Menu, X, HeartHandshake, Inbox, Camera,
} from 'lucide-react';

const navItems = [
    { to: '/management',            label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/management/workers',    label: 'Workers',   icon: Users },
    { to: '/management/tasks',      label: 'Tasks',     icon: ClipboardList },
    { to: '/management/timelogs',   label: 'Time Logs', icon: Clock },
    { to: '/management/engagement', label: 'Engagement', icon: HeartHandshake },
    { to: '/management/leave',      label: 'Leave',     icon: Inbox },
    { to: '/management/face-logs',  label: 'Face Logs', icon: Camera },
    { to: '/management/reports',    label: 'Reports',   icon: BarChart2 },
];

const MODEL_COMPARISON_ROWS = [
    { Metric: 'Accuracy', 'Random Forest': '67.44%', XGBoost: '66.37%', LSTM: '56.10%' },
    { Metric: 'F1-Score (Avg)', 'Random Forest': '0.7', XGBoost: '0.69', LSTM: '0.61' },
    { Metric: 'Complexity', 'Random Forest': 'Moderate', XGBoost: 'High', LSTM: 'Very High' },
] as const;

export default function ManagementLayout() {
    const { user, logout } = useAuth();
    const navigate         = useNavigate();
    const [open, setOpen]  = useState(false);

    useEffect(() => {
        console.log('[Model comparison]');
        console.table(MODEL_COMPARISON_ROWS);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800
                flex flex-col transform transition-transform duration-200
                ${open ? 'translate-x-0' : '-translate-x-full'}
                lg:relative lg:translate-x-0
            `}>
                <div className="p-6 border-b border-gray-800">
                    <div className="text-xl font-bold text-white">🏭 WareHRM</div>
                    <div className="text-xs text-blue-400 mt-1">Management Panel</div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                                    isActive
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`
                            }
                        >
                            <Icon size={18} />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="text-sm font-medium">{user?.name}</div>
                            <div className="text-xs text-gray-500">{user?.employee_id}</div>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition"
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </aside>

            {open && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setOpen(false)} />
            )}

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                    <button className="lg:hidden text-gray-400" onClick={() => setOpen(!open)}>
                        {open ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="text-gray-400 text-sm">
                        Welcome, <span className="text-white font-medium">{user?.name}</span>
                    </div>
                    <div className="bg-blue-900/40 text-blue-400 text-xs px-3 py-1 rounded-full border border-blue-700 capitalize">
                        {user?.role === 'hr' ? 'HR' : user?.role === 'supervisor' ? 'Supervisor' : 'Management'}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}