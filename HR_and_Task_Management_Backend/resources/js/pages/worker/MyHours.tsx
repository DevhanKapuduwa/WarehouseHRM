import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeLogApi } from '../../api/timeLogs';
import { MyHoursResponse } from '../../types';
import { Clock, Loader2, LogIn, LogOut, AlertCircle } from 'lucide-react';

export default function MyHours() {
    const qc = useQueryClient();

    const { data, isLoading, error } = useQuery<MyHoursResponse>({
        queryKey: ['my-hours'],
        queryFn: timeLogApi.myHours,
        refetchInterval: 30000,
    });

    const clockIn = useMutation({
        mutationFn: () => timeLogApi.clockIn(),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-hours'] }); qc.invalidateQueries({ queryKey: ['worker-dashboard'] }); },
    });

    const clockOut = useMutation({
        mutationFn: () => timeLogApi.clockOut(),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-hours'] }); qc.invalidateQueries({ queryKey: ['worker-dashboard'] }); },
    });

    const fmtTime = (d?: string | null) => d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
    const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
    const fmtDur = (m?: number | null) => { if (!m) return '—'; const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`; };

    if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-green-400" size={28} /></div>;
    if (error || !data) return (
        <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-2">
            <AlertCircle size={32} /><p>Failed to load hours</p>
        </div>
    );

    const hasOpenLog = data.logs.some(l => !l.clock_out);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <Clock size={24} className="text-green-400" /> My Hours
            </h1>

            {/* Summary + Clock */}
            <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <p className="text-gray-400 text-sm">This Week</p>
                    <p className="text-3xl font-bold text-green-400 mt-1">{data.week_hours}h</p>
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <p className="text-gray-400 text-sm">This Month</p>
                    <p className="text-3xl font-bold text-blue-400 mt-1">{data.month_hours}h</p>
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-col items-center justify-center">
                    {hasOpenLog ? (
                        <>
                            <div className="w-3 h-3 bg-green-500 rounded-full mb-2 animate-pulse" />
                            <button onClick={() => clockOut.mutate()} disabled={clockOut.isPending}
                                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition">
                                {clockOut.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Clock Out
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="w-3 h-3 bg-gray-600 rounded-full mb-2" />
                            <button onClick={() => clockIn.mutate()} disabled={clockIn.isPending}
                                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition">
                                {clockIn.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Clock In
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Log History */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="font-semibold">Log History</h2>
                </div>
                {data.logs.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">No time logs yet</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                                <th className="text-left px-5 py-3">Date</th>
                                <th className="text-left px-5 py-3">Task</th>
                                <th className="text-left px-5 py-3">In</th>
                                <th className="text-left px-5 py-3">Out</th>
                                <th className="text-right px-5 py-3">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {data.logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-800/40 transition">
                                    <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(log.clock_in)}</td>
                                    <td className="px-5 py-3 text-gray-300">{log.task?.title || <span className="text-gray-600 italic">—</span>}</td>
                                    <td className="px-5 py-3">
                                        <span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded text-xs font-mono">{fmtTime(log.clock_in)}</span>
                                    </td>
                                    <td className="px-5 py-3">
                                        {log.clock_out
                                            ? <span className="bg-red-900/30 text-red-400 px-2 py-0.5 rounded text-xs font-mono">{fmtTime(log.clock_out)}</span>
                                            : <span className="bg-green-900/20 text-green-400 px-2 py-0.5 rounded text-xs animate-pulse">Active</span>}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {log.duration_minutes
                                            ? <span className="font-semibold text-white">{fmtDur(log.duration_minutes)}</span>
                                            : <span className="text-green-400 text-xs animate-pulse">In progress</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}