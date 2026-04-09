import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { taskApi } from '../../api/tasks';
import { workerApi } from '../../api/workers';
import { timeLogApi } from '../../api/timeLogs';
import { shiftApi } from '../../api/shifts';
import { Task, TimeLog, Shift } from '../../types';
import { BarChart2, Loader2, Plus, Trash2, X, Calendar } from 'lucide-react';

export default function Reports() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const canManageShifts = user?.role === 'management';
    const [showShiftModal, setShowShiftModal] = useState(false);
    const [shiftForm, setShiftForm] = useState({ user_id: '', shift_name: '', start_time: '', end_time: '', date: '' });

    const { data: tasks = [], isLoading: tLoading } = useQuery<Task[]>({ queryKey: ['tasks'], queryFn: () => taskApi.getAll() });
    const { data: workers = [] } = useQuery({ queryKey: ['workers'], queryFn: workerApi.getAll });
    const { data: logs = [] } = useQuery<TimeLog[]>({ queryKey: ['time-logs'], queryFn: () => timeLogApi.getAll() });
    const { data: shifts = [], isLoading: sLoading } = useQuery<Shift[]>({ queryKey: ['shifts'], queryFn: shiftApi.getAll });

    const createShift = useMutation({
        mutationFn: () => shiftApi.create({ ...shiftForm, user_id: Number(shiftForm.user_id) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); setShowShiftModal(false); setShiftForm({ user_id: '', shift_name: '', start_time: '', end_time: '', date: '' }); },
    });
    const deleteShift = useMutation({ mutationFn: shiftApi.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }) });

    const isLoading = tLoading || sLoading;
    if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProg = tasks.filter(t => t.status === 'in_progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const cancelled = tasks.filter(t => t.status === 'cancelled').length;
    const totalHrs = Math.round(logs.reduce((s, l) => s + (l.duration_minutes || 0), 0) / 60 * 10) / 10;
    const avgDur = logs.filter(l => l.duration_minutes).length > 0
        ? Math.round(logs.reduce((s, l) => s + (l.duration_minutes || 0), 0) / logs.filter(l => l.duration_minutes).length)
        : 0;

    const statusData = [
        { label: 'Pending', count: pending, pct: tasks.length ? Math.round(pending / tasks.length * 100) : 0, color: 'bg-yellow-500', text: 'text-yellow-400' },
        { label: 'In Progress', count: inProg, pct: tasks.length ? Math.round(inProg / tasks.length * 100) : 0, color: 'bg-blue-500', text: 'text-blue-400' },
        { label: 'Completed', count: completed, pct: tasks.length ? Math.round(completed / tasks.length * 100) : 0, color: 'bg-green-500', text: 'text-green-400' },
        { label: 'Cancelled', count: cancelled, pct: tasks.length ? Math.round(cancelled / tasks.length * 100) : 0, color: 'bg-red-500', text: 'text-red-400' },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart2 size={24} className="text-blue-400" /> Reports</h1>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <p className="text-gray-400 text-sm">Total Tasks</p>
                    <p className="text-3xl font-bold text-white mt-1">{tasks.length}</p>
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <p className="text-gray-400 text-sm">Completion Rate</p>
                    <p className="text-3xl font-bold text-green-400 mt-1">{tasks.length ? Math.round(completed / tasks.length * 100) : 0}%</p>
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <p className="text-gray-400 text-sm">Total Hours Logged</p>
                    <p className="text-3xl font-bold text-blue-400 mt-1">{totalHrs}h</p>
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <p className="text-gray-400 text-sm">Avg. Session</p>
                    <p className="text-3xl font-bold text-purple-400 mt-1">{avgDur}m</p>
                </div>
            </div>

            {/* Task Status Breakdown */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h2 className="font-semibold mb-4">Task Status Breakdown</h2>
                <div className="flex h-4 rounded-full overflow-hidden bg-gray-800 mb-4">
                    {statusData.filter(s => s.pct > 0).map(s => (
                        <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.pct}%`} />
                    ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {statusData.map(s => (
                        <div key={s.label} className="flex items-center gap-2 text-sm">
                            <div className={`w-3 h-3 rounded-full ${s.color}`} />
                            <span className="text-gray-400">{s.label}</span>
                            <span className={`font-bold ml-auto ${s.text}`}>{s.count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Shifts Schedule */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                    <h2 className="font-semibold flex items-center gap-2"><Calendar size={18} className="text-blue-400" /> Shift Schedule</h2>
                    {canManageShifts && (
                        <button type="button" onClick={() => setShowShiftModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
                            <Plus size={14} /> Add Shift
                        </button>
                    )}
                </div>
                {shifts.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">No shifts scheduled</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                            <th className="text-left px-5 py-3">Worker</th><th className="text-left px-5 py-3">Shift</th>
                            <th className="text-left px-5 py-3">Time</th><th className="text-left px-5 py-3">Date</th>
                            {canManageShifts && <th className="text-right px-5 py-3"></th>}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-800">
                            {shifts.map(s => (
                                <tr key={s.id} className="hover:bg-gray-800/40 transition group">
                                    <td className="px-5 py-3 font-medium">{s.user?.name || '—'} <span className="text-gray-500 text-xs font-mono">{s.user?.employee_id}</span></td>
                                    <td className="px-5 py-3 text-gray-300">{s.shift_name}</td>
                                    <td className="px-5 py-3 text-gray-400 font-mono text-xs">{s.start_time} — {s.end_time}</td>
                                    <td className="px-5 py-3 text-gray-400 text-xs">{new Date(s.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                                    {canManageShifts && (
                                        <td className="px-5 py-3 text-right">
                                            <button type="button" onClick={() => deleteShift.mutate(s.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition"><Trash2 size={14} /></button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Shift Modal */}
            {canManageShifts && showShiftModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowShiftModal(false)}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="text-lg font-bold">Add Shift</h3>
                            <button onClick={() => setShowShiftModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={e => { e.preventDefault(); createShift.mutate(); }} className="p-5 space-y-4">
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Worker *</label>
                                <select required value={shiftForm.user_id} onChange={e => setShiftForm({ ...shiftForm, user_id: e.target.value })}
                                    className="w-full bg-gray-800 text-gray-300 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none">
                                    <option value="">Select worker</option>
                                    {workers.filter(w => w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Shift Name *</label>
                                <input required value={shiftForm.shift_name} onChange={e => setShiftForm({ ...shiftForm, shift_name: e.target.value })}
                                    placeholder="e.g. Morning Shift" className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Start *</label>
                                    <input type="time" required value={shiftForm.start_time} onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">End *</label>
                                    <input type="time" required value={shiftForm.end_time} onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Date *</label>
                                <input type="date" required value={shiftForm.date} onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setShowShiftModal(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white">Cancel</button>
                                <button type="submit" disabled={createShift.isPending}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 transition">
                                    {createShift.isPending && <Loader2 size={14} className="animate-spin" />} Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}