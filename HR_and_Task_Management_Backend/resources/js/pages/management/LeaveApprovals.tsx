import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { leaveApi } from '../../api/leave';
import type { LeaveRequest, LeaveType } from '../../types';
import { Loader2, CheckCircle2, XCircle, Inbox, List } from 'lucide-react';

type InboxItem = {
    id: number;
    leave_request_id: number;
    step_index: number;
    required_role: string;
    action: 'approved' | 'rejected' | null;
    comment: string | null;
    acted_at: string | null;
    leave_request?: LeaveRequest;
    leaveRequest?: LeaveRequest;
};

const statusBadge: Record<string, string> = {
    pending: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
    approved: 'bg-green-900/40 text-green-300 border-green-800/50',
    rejected: 'bg-red-900/40 text-red-300 border-red-800/50',
    cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
};

function fmtDt(d: string) {
    return new Date(d).toLocaleString();
}

function chainRoles(req: LeaveRequest): string[] {
    const raw = req.leave_type?.approval_chain_roles ?? req.leaveType?.approval_chain_roles ?? [];
    if (Array.isArray(raw)) {
        return [...raw];
    }
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, string>;
        return Object.keys(o)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => o[k]);
    }
    return [];
}

function currentStepLabel(req: LeaveRequest): string {
    const chain = chainRoles(req);
    const step = req.current_step ?? 0;
    if (req.status !== 'pending') return '—';
    if (!chain.length) return 'No approval chain';
    const role = chain[step];
    if (!role) return 'Complete';
    return `Awaiting ${role} (step ${step + 1} of ${chain.length})`;
}

function canUserActOnLeave(req: LeaveRequest, userRole: string | undefined): boolean {
    if (!userRole || req.status !== 'pending') return false;
    const chain = chainRoles(req);
    const step = req.current_step ?? 0;
    return chain[step] === userRole;
}

export default function LeaveApprovals() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const [comment, setComment] = useState<Record<number, string>>({});
    const [error, setError] = useState('');
    const [listFilter, setListFilter] = useState<string>('');

    const { data: inbox = [], isLoading: loadingInbox } = useQuery<InboxItem[]>({
        queryKey: ['leave-inbox'],
        queryFn: leaveApi.inbox as () => Promise<InboxItem[]>,
    });

    const { data: allRequests = [], isLoading: loadingAll } = useQuery<LeaveRequest[]>({
        queryKey: ['leave-requests-all', listFilter],
        queryFn: () => leaveApi.allRequests(listFilter ? { status: listFilter } : undefined),
    });

    const actMut = useMutation({
        mutationFn: ({ requestId, action }: { requestId: number; action: 'approved' | 'rejected' }) =>
            leaveApi.act(requestId, { action, comment: comment[requestId] || null }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['leave-inbox'] });
            qc.invalidateQueries({ queryKey: ['leave-requests-all'] });
            setError('');
        },
        onError: (e: any) => setError(e.response?.data?.message || 'Failed to act on request'),
    });

    const rows = useMemo(() => inbox.map(i => {
        const req = i.leaveRequest ?? i.leave_request;
        return { item: i, req };
    }), [inbox]);

    const lt = (req: LeaveRequest): LeaveType | undefined => req.leaveType ?? req.leave_type;

    return (
        <div className="space-y-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <Inbox size={22} className="text-blue-400" /> Leave
            </h1>

            {error && (
                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Pending actions at your role */}
            <section>
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Inbox size={18} className="text-blue-400" /> Awaiting your approval
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                    Only requests where it is your turn in the approval chain appear here. New requests usually start with the first role in the chain (e.g. supervisor).
                </p>
                {loadingInbox ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800">
                        Nothing waiting for your sign-off right now.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rows.map(({ item, req }) => (
                            <div key={item.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-sm text-gray-400">Step {item.step_index + 1} · Role: {item.required_role}</div>
                                        <div className="text-lg font-bold text-white mt-1">
                                            {req?.user?.name ?? 'Worker'} — {lt(req!)?.name ?? 'Leave'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {req && fmtDt(String(req.start_at))} → {req && fmtDt(String(req.end_at))} · {req?.duration_hours}h total
                                        </div>
                                        {req?.reason && <div className="text-gray-400 text-sm mt-2">{req.reason}</div>}
                                    </div>

                                    <div className="flex-shrink-0 w-full md:w-80 space-y-2">
                                        <input
                                            value={comment[req?.id ?? 0] ?? ''}
                                            onChange={(e) => setComment(prev => ({ ...prev, [req!.id]: e.target.value }))}
                                            placeholder="Optional comment"
                                            className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => actMut.mutate({ requestId: req!.id, action: 'approved' })}
                                                disabled={actMut.isPending}
                                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg flex items-center justify-center gap-2"
                                            >
                                                {actMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => actMut.mutate({ requestId: req!.id, action: 'rejected' })}
                                                disabled={actMut.isPending}
                                                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg flex items-center justify-center gap-2"
                                            >
                                                {actMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Full list */}
            <section>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <List size={18} className="text-cyan-400" /> All leave requests
                    </h2>
                    <select
                        value={listFilter}
                        onChange={(e) => setListFilter(e.target.value)}
                        className="bg-gray-800 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 max-w-xs"
                    >
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                {loadingAll ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-400" size={28} /></div>
                ) : allRequests.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800">
                        No leave requests found.
                    </div>
                ) : (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                                    <th className="text-left px-4 py-3">Employee</th>
                                    <th className="text-left px-4 py-3">Type</th>
                                    <th className="text-left px-4 py-3">Period</th>
                                    <th className="text-right px-4 py-3">Hours</th>
                                    <th className="text-left px-4 py-3">Workflow</th>
                                    <th className="text-center px-4 py-3">Status</th>
                                    <th className="text-right px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {allRequests.map((r) => (
                                    <tr key={r.id} className="hover:bg-gray-800/40">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-white">{r.user?.name ?? `#${r.user_id}`}</div>
                                            <div className="text-xs text-gray-500 font-mono">{r.user?.employee_id ?? '—'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-300">{lt(r)?.name ?? '—'}</td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {fmtDt(String(r.start_at))}
                                            <br />
                                            <span className="text-gray-600">to</span> {fmtDt(String(r.end_at))}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-200">{r.duration_hours}h</td>
                                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px]">
                                            {currentStepLabel(r)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs border capitalize ${statusBadge[r.status] ?? statusBadge.pending}`}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {canUserActOnLeave(r, user?.role) ? (
                                                <div className="flex flex-col items-end gap-2">
                                                    <div className="flex gap-1 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => actMut.mutate({ requestId: r.id, action: 'approved' })}
                                                            disabled={actMut.isPending}
                                                            className="text-xs px-2 py-1 rounded bg-green-900/50 text-green-300 border border-green-800 hover:bg-green-800/50 disabled:opacity-50"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => actMut.mutate({ requestId: r.id, action: 'rejected' })}
                                                            disabled={actMut.isPending}
                                                            className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 border border-red-800 hover:bg-red-800/50 disabled:opacity-50"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-600 text-xs">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
