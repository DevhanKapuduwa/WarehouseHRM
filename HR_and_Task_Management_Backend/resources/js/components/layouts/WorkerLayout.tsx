import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, ClipboardList, Clock, LogOut, CalendarDays, UserCircle, Camera } from 'lucide-react';

const navItems = [
    { to: '/worker',            label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/worker/my-tasks',   label: 'My Tasks',  icon: ClipboardList },
    { to: '/worker/my-hours',   label: 'My Hours',  icon: Clock },
    { to: '/worker/leave',      label: 'Leave',     icon: CalendarDays },
    { to: '/worker/face-logs',  label: 'Face Logs', icon: Camera },
    { to: '/worker/profile',   label: 'My Profile', icon: UserCircle },
];

export default function WorkerLayout() {
    const { user, logout } = useAuth();
    const navigate         = useNavigate();

    return (
        <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
            <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col">
                <div className="p-6 border-b border-gray-800">
                    <div className="text-xl font-bold">🏭 WareHRM</div>
                    <div className="text-xs text-green-400 mt-1">Worker Portal</div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                                    isActive
                                        ? 'bg-green-600 text-white'
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
                        <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center font-bold text-sm">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="text-sm font-medium">{user?.name}</div>
                            <div className="text-xs text-gray-500">{user?.department}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => { logout(); navigate('/login'); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition"
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex justify-between items-center">
                    <div className="text-gray-400 text-sm">
                        Hello, <span className="text-white font-medium">{user?.name}</span>
                    </div>
                    <div className="bg-green-900/40 text-green-400 text-xs px-3 py-1 rounded-full border border-green-700">
                        Worker · {user?.employee_id}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}