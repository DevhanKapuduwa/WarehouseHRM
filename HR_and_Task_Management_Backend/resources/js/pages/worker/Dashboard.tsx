import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workerApi } from '../../api/workers';
import { timeLogApi } from '../../api/timeLogs';
import {
    ClipboardList, Loader2, CheckCircle2, Clock,
    Play, LogIn, LogOut, Calendar, AlertCircle
} from 'lucide-react';

const gradients: Record<string, string> = {
    yellow: 'from-yellow-500/20 to-yellow-900/10 border-yellow-500/30',
    blue: 'from-blue-500/20   to-blue-900/10   border-blue-500/30',
    green: 'from-green-500/20  to-green-900/10  border-green-500/30',
    purple: 'from-purple-500/20 to-purple-900/10 border-purple-500/30',
};
const iconColors: Record<string, string> = {
    yellow: 'text-yellow-400', blue: 'text-blue-400', green: 'text-green-400', purple: 'text-purple-400',
};

export default function WorkerDashboard() {
    const qc = useQueryClient();

    const { data: dash, isLoading, error } = useQuery({
        queryKey: ['worker-dashboard'],
        queryFn: workerApi.dashboard,
        refetchInterval: 15000,
    });

    const clockIn = useMutation({
        mutationFn: () => timeLogApi.clockIn(),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-dashboard'] }),
    });

    const clockOut = useMutation({
        mutationFn: () => timeLogApi.clockOut(),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-dashboard'] }),
    });

    if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-green-400" size={28} /></div>;
    if (error || !dash) return (
        <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-2">
            <AlertCircle size={32} /><p>Failed to load dashboard</p>
        </div>
    );

    const cards = [
        { label: 'Pending Tasks', value: dash.pending_tasks, icon: ClipboardList, color: 'yellow' },
        { label: 'In Progress', value: dash.in_progress, icon: Play, color: 'blue' },
        { label: 'Completed Today', value: dash.completed_today, icon: CheckCircle2, color: 'green' },
        { label: 'Hours This Week', value: dash.hours_this_week, icon: Clock, color: 'purple' },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-4">
                {cards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className={`bg-gradient-to-br ${gradients[color]} border rounded-xl p-5 transition-transform hover:scale-[1.02]`}>
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

            {/* Clock In/Out */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
                <h2 className="font-semibold mb-4 flex items-center justify-center gap-2">
                    <Clock size={18} className="text-green-400" /> Time Clock
                </h2>
                {dash.is_clocked_in ? (
                    <div>
                        <div className="w-4 h-4 bg-green-500 rounded-full mx-auto mb-3 animate-pulse" />
                        <p className="text-green-400 text-sm mb-4">You are currently clocked in</p>
                        <button
                            onClick={() => clockOut.mutate()}
                            disabled={clockOut.isPending}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-xl flex items-center gap-2 mx-auto transition">
                            {clockOut.isPending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} Clock Out
                        </button>
                    </div>
                ) : (
                    <div>
                        <div className="w-4 h-4 bg-gray-600 rounded-full mx-auto mb-3" />
                        <p className="text-gray-400 text-sm mb-4">You are not clocked in</p>
                        <button
                            onClick={() => clockIn.mutate()}
                            disabled={clockIn.isPending}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-xl flex items-center gap-2 mx-auto transition">
                            {clockIn.isPending ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Clock In
                        </button>
                    </div>
                )}
            </div>

            {/* Today's Shift */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h2 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar size={18} className="text-green-400" /> Today's Shift
                </h2>
                {dash.todays_shift ? (
                    <div className="flex items-center gap-6">
                        <div>
                            <p className="text-green-400 font-medium">{dash.todays_shift.shift_name}</p>
                            <p className="text-gray-400 text-sm font-mono mt-1">
                                {dash.todays_shift.start_time} — {dash.todays_shift.end_time}
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">No shift scheduled for today</p>
                )}
            </div>
        </div>
    );
}