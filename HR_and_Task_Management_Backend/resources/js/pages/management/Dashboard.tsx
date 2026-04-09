import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { managementApi } from '../../api/management';
import { announcementApi } from '../../api/announcements';
import {
    Users, UserCheck, ClipboardList, Loader2,
    CheckCircle2, Clock, Megaphone, Send, Trash2, AlertCircle, AlertTriangle
} from 'lucide-react';

const gradients: Record<string, string> = {
    blue: 'from-blue-500/20    to-blue-900/10    border-blue-500/30',
    green: 'from-green-500/20   to-green-900/10   border-green-500/30',
    yellow: 'from-yellow-500/20  to-yellow-900/10  border-yellow-500/30',
    purple: 'from-purple-500/20  to-purple-900/10  border-purple-500/30',
    emerald: 'from-emerald-500/20 to-emerald-900/10 border-emerald-500/30',
    orange: 'from-orange-500/20  to-orange-900/10  border-orange-500/30',
};

const iconColors: Record<string, string> = {
    blue: 'text-blue-400', green: 'text-green-400', yellow: 'text-yellow-400',
    purple: 'text-purple-400', emerald: 'text-emerald-400', orange: 'text-orange-400',
};

const statusBadge: Record<string, string> = {
    pending: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50',
    in_progress: 'bg-blue-900/40   text-blue-400   border border-blue-700/50',
    completed: 'bg-green-900/40  text-green-400  border border-green-700/50',
    cancelled: 'bg-red-900/40    text-red-400    border border-red-700/50',
    pending_approval: 'bg-purple-900/40 text-purple-400 border border-purple-700/50',
};

const priorityColor: Record<string, string> = {
    low: 'text-gray-400', medium: 'text-yellow-400', high: 'text-red-400',
};

export default function ManagementDashboard() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const canManageAnnouncements = user?.role === 'management';

    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: managementApi.stats,
        refetchInterval: 30000,
    });

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [target, setTarget] = useState<'all' | 'workers' | 'management'>('all');

    const postAnno = useMutation({
        mutationFn: () => announcementApi.create({ title, body, target }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboard-stats'] }); setTitle(''); setBody(''); },
    });

    const delAnno = useMutation({
        mutationFn: (id: number) => announcementApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-stats'] }),
    });

    /* ── Loading / Error ─────────────────────────────── */
    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-blue-400" size={32} />
        </div>
    );
    if (error || !stats) return (
        <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-2">
            <AlertCircle size={32} /><p>Failed to load dashboard</p>
        </div>
    );

    const cards = [
        { label: 'Total Workers', value: stats.total_workers, icon: Users, color: 'blue' },
        { label: 'Active Workers', value: stats.active_workers, icon: UserCheck, color: 'green' },
        { label: 'Pending Tasks', value: stats.pending_tasks, icon: ClipboardList, color: 'yellow' },
        { label: 'In Progress', value: stats.in_progress, icon: Loader2, color: 'purple' },
        { label: 'Awaiting Approval', value: (stats as any).pending_approval ?? 0, icon: AlertTriangle, color: 'orange' },
        { label: 'Completed Today', value: stats.completed_today, icon: CheckCircle2, color: 'emerald' },
        { label: 'Clocked In Now', value: stats.clocked_in_now, icon: Clock, color: 'blue' },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>

            {/* ── Stat Cards ────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map(({ label, value, icon: Icon, color }) => (
                    <div
                        key={label}
                        className={`bg-gradient-to-br ${gradients[color]} border rounded-xl p-5 transition-transform hover:scale-[1.02]`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm">{label}</p>
                                <p className={`text-3xl font-bold mt-1 ${iconColors[color]}`}>{value}</p>
                            </div>
                            <Icon size={28} className={`${iconColors[color]} opacity-60`} />
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Bottom Grid ───────────────────────────── */}
            <div className="grid lg:grid-cols-3 gap-6">

                {/* Recent Tasks */}
                <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
                        <ClipboardList size={18} className="text-blue-400" />
                        <h2 className="font-semibold">Recent Tasks</h2>
                    </div>

                    {stats.recent_tasks.length === 0 ? (
                        <div className="p-10 text-center text-gray-500">No tasks yet</div>
                    ) : (
                        <div className="divide-y divide-gray-800">
                            {stats.recent_tasks.map(t => (
                                <div key={t.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-800/50 transition">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{t.title}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {t.worker?.name ?? '—'} &middot; {t.worker?.employee_id ?? ''}
                                        </p>
                                    </div>
                                    <span className={`text-xs font-semibold ${priorityColor[t.priority ?? 'medium']}`}>
                                        {(t.priority ?? 'medium').toUpperCase()}
                                    </span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap ${statusBadge[t.status] || 'bg-gray-800 text-gray-400'}`}>
                                        {t.status.replace(/_/g, ' ')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Announcements */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
                        <Megaphone size={18} className="text-yellow-400" />
                        <h2 className="font-semibold">Announcements</h2>
                    </div>

                    <div className="flex-1 divide-y divide-gray-800 max-h-56 overflow-y-auto">
                        {stats.announcements.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-sm">No announcements</div>
                        ) : (
                            stats.announcements.map(a => (
                                <div key={a.id} className="px-4 py-3 group">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">{a.title}</p>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                                        </div>
                                        {canManageAnnouncements && (
                                            <button
                                                type="button"
                                                onClick={() => delAnno.mutate(a.id)}
                                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition flex-shrink-0 mt-0.5"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">{a.creator?.name} &middot; {a.target}</p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Create Announcement (management only — API enforces the same) */}
                    {canManageAnnouncements ? (
                        <div className="p-3 border-t border-gray-800 space-y-2">
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Title"
                                className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                            />
                            <textarea
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Message..."
                                rows={2}
                                className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
                            />
                            <div className="flex items-center gap-2">
                                <select
                                    value={target}
                                    onChange={e => setTarget(e.target.value as typeof target)}
                                    className="bg-gray-800 text-gray-300 text-xs px-2 py-1.5 rounded border border-gray-700 focus:outline-none"
                                >
                                    <option value="all">All</option>
                                    <option value="workers">Workers</option>
                                    <option value="management">Management</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => title && body && postAnno.mutate()}
                                    disabled={!title || !body || postAnno.isPending}
                                    className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                                >
                                    <Send size={12} /> Post
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 border-t border-gray-800 text-xs text-gray-500">
                            Posting announcements is limited to management accounts.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}