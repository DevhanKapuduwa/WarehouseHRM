import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { timeLogApi } from '../../api/timeLogs';
import { workerApi } from '../../api/workers';
import { TimeLog } from '../../types';
import { Clock, Loader2, Filter } from 'lucide-react';

export default function TimeLogs() {
    const [workerFilter, setWorkerFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');

    const { data: workers = [] } = useQuery({ queryKey: ['workers'], queryFn: workerApi.getAll });

    const { data: logs = [], isLoading } = useQuery<TimeLog[]>({
        queryKey: ['time-logs', workerFilter, dateFilter],
        queryFn: () => timeLogApi.getAll({
            ...(workerFilter && { worker_id: Number(workerFilter) }),
            ...(dateFilter && { date: dateFilter }),
        }),
    });

    const fmtTime = (d?: string | null) => d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
    const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
    const fmtDur = (m?: number | null) => { if (!m) return '—'; const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`; };
    const totalMins = logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Clock size={24} className="text-blue-400" /> Time Logs
                    <span className="text-sm font-normal text-gray-500 ml-2">({logs.length})</span>
                </h1>
                {logs.length > 0 && (
                    <div className="bg-blue-900/30 border border-blue-700/50 text-blue-300 text-sm px-4 py-2 rounded-lg">
                        Total: <span className="font-bold text-blue-400">{fmtDur(totalMins)}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-3 items-center">
                <Filter size={16} className="text-gray-400" />
                <select value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}
                    className="bg-gray-900 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-blue-500">
                    <option value="">All Workers</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.employee_id})</option>)}
                </select>
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                    className="bg-gray-900 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-blue-500" />
                {(workerFilter || dateFilter) && (
                    <button onClick={() => { setWorkerFilter(''); setDateFilter(''); }} className="text-xs text-gray-400 hover:text-white">Clear</button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
            ) : logs.length === 0 ? (
                <div className="text-center py-16 text-gray-500">No time logs found</div>
            ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                                <th className="text-left px-5 py-4">Worker</th>
                                <th className="text-left px-5 py-4">Task</th>
                                <th className="text-left px-5 py-4">Date</th>
                                <th className="text-left px-5 py-4">In</th>
                                <th className="text-left px-5 py-4">Out</th>
                                <th className="text-right px-5 py-4">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-800/40 transition">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-600/30 rounded-full flex items-center justify-center text-xs font-bold text-blue-400">
                                                {log.user?.name?.charAt(0) || '?'}
                                            </div>
                                            <div>
                                                <p className="font-medium">{log.user?.name || '—'}</p>
                                                <p className="text-xs text-gray-500 font-mono">{log.user?.employee_id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-300">{log.task?.title || <span className="text-gray-600 italic">—</span>}</td>
                                    <td className="px-5 py-4 text-gray-400 text-xs">{fmtDate(log.clock_in)}</td>
                                    <td className="px-5 py-4"><span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded text-xs font-mono">{fmtTime(log.clock_in)}</span></td>
                                    <td className="px-5 py-4">
                                        {log.clock_out
                                            ? <span className="bg-red-900/30 text-red-400 px-2 py-0.5 rounded text-xs font-mono">{fmtTime(log.clock_out)}</span>
                                            : <span className="bg-green-900/20 text-green-400 px-2 py-0.5 rounded text-xs animate-pulse">Active</span>}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {log.duration_minutes
                                            ? <span className="font-semibold text-white">{fmtDur(log.duration_minutes)}</span>
                                            : <span className="text-green-400 text-xs animate-pulse">In progress</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}