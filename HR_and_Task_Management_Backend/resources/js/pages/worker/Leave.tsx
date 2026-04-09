import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, ClipboardList, Loader2, Send } from 'lucide-react';
import React, { useMemo, useState, type FormEvent } from 'react';
import { leaveApi } from '../../api/leave';
import type { LeaveBalance, LeaveRequest, LeaveType } from '../../types';

const fmt = (d: string) => new Date(d).toLocaleString();

const initialForm = {
    leave_type_id: '',
    single_date: '',
    range_start: '',
    range_end: '',
    hours_per_day: '8',
    reason: '',
};

/** Inclusive calendar-day count (start and end dates both count). */
function inclusiveCalendarDays(startYmd: string, endYmd: string): number {
    if (!startYmd || !endYmd) return 0;
    const a = new Date(`${startYmd}T12:00:00`);
    const b = new Date(`${endYmd}T12:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    if (b < a) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function fmtDay(ymd: string): string {
    if (!ymd) return '';
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function renderEmphasis(line: string) {
    const parts = line.split('**');
    return parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="text-white">{p}</strong> : <span key={i}>{p}</span>));
}

export default function Leave() {
    const qc = useQueryClient();
    const [formError, setFormError] = useState('');
    const [rangeMode, setRangeMode] = useState<'single' | 'range'>('single');
    const [form, setForm] = useState({ ...initialForm });

    const { data: balances = [], isLoading: loadingBalances } = useQuery<LeaveBalance[]>({
        queryKey: ['leave-balances'],
        queryFn: leaveApi.myBalances,
    });

    const { data: types = [], isLoading: loadingTypes } = useQuery<LeaveType[]>({
        queryKey: ['leave-types'],
        queryFn: leaveApi.workerTypes,
    });

    const { data: requests = [], isLoading: loadingRequests } = useQuery<LeaveRequest[]>({
        queryKey: ['leave-requests'],
        queryFn: leaveApi.myRequests,
    });

    const leavePreview = useMemo(() => {
        const hpd = Number(form.hours_per_day);
        if (!Number.isInteger(hpd) || hpd < 1 || hpd > 8) return null;

        if (rangeMode === 'single') {
            if (!form.single_date) return null;
            const days = 1;
            const total = hpd * days;
            return {
                days,
                hoursPerDay: hpd,
                totalHours: total,
                lines: [
                    `Single day: **${fmtDay(form.single_date)}**`,
                    `**${hpd} hour${hpd === 1 ? '' : 's'}** on that day.`,
                    `**Total deduction from your balance: ${total} hour${total === 1 ? '' : 's'}.**`,
                ],
            };
        }

        if (!form.range_start || !form.range_end) return null;
        const days = inclusiveCalendarDays(form.range_start, form.range_end);
        if (days <= 0) return null;
        const total = hpd * days;
        if (total > 8 * days) return null;
        return {
            days,
            hoursPerDay: hpd,
            totalHours: total,
            lines: [
                `Date range: **${fmtDay(form.range_start)}** through **${fmtDay(form.range_end)}** (**${days}** calendar day${days === 1 ? '' : 's'}, inclusive).`,
                `**${hpd} hour${hpd === 1 ? '' : 's'}** applied on **each** of those days.`,
                `**Total: ${hpd} × ${days} = ${total} hour${total === 1 ? '' : 's'}** deducted from your leave balance if approved.`,
            ],
        };
    }, [rangeMode, form.single_date, form.range_start, form.range_end, form.hours_per_day]);

    const createMut = useMutation({
        mutationFn: (payload: {
            leave_type_id: number;
            start_at: string;
            end_at: string;
            duration_hours: number;
            reason: string | null;
        }) => leaveApi.createRequest(payload),
        onSuccess: () => {
            setFormError('');
            setForm({ ...initialForm });
            setRangeMode('single');
            qc.invalidateQueries({ queryKey: ['leave-requests'] });
            qc.invalidateQueries({ queryKey: ['leave-balances'] });
        },
        onError: (e: any) => setFormError(e.response?.data?.message || 'Failed to submit leave request'),
    });

    const balanceByType = useMemo(() => {
        const map: Record<number, LeaveBalance> = {};
        for (const b of balances) map[b.leave_type_id] = b;
        return map;
    }, [balances]);

    const getBalanceTypeName = (b: LeaveBalance) =>
        b.leaveType?.name ?? b.leave_type?.name ?? `Type #${b.leave_type_id}`;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setFormError('');

        const hpd = Number(form.hours_per_day);
        if (!Number.isInteger(hpd) || hpd < 1 || hpd > 8) {
            setFormError('Hours per day must be a whole number between 1 and 8.');
            return;
        }

        if (!form.leave_type_id) {
            setFormError('Please select a leave type.');
            return;
        }

        let start_at: string;
        let end_at: string;
        let duration_hours: number;

        if (rangeMode === 'single') {
            if (!form.single_date) {
                setFormError('Please select a date.');
                return;
            }
            start_at = `${form.single_date}T00:00:00`;
            end_at = `${form.single_date}T23:59:59`;
            duration_hours = hpd;
        } else {
            if (!form.range_start || !form.range_end) {
                setFormError('Please select start and end dates.');
                return;
            }
            const days = inclusiveCalendarDays(form.range_start, form.range_end);
            if (days <= 0) {
                setFormError('End date must be on or after the start date.');
                return;
            }
            start_at = `${form.range_start}T00:00:00`;
            end_at = `${form.range_end}T23:59:59`;
            duration_hours = hpd * days;
        }

        createMut.mutate({
            leave_type_id: Number(form.leave_type_id),
            start_at,
            end_at,
            duration_hours,
            reason: form.reason || null,
        });
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ClipboardList size={22} className="text-green-400" /> Leave
            </h1>

            {/* Balances */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <div className="text-sm font-semibold text-white mb-3">My leave balances (hours)</div>
                {loadingBalances ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="animate-spin" size={16} /> Loading…</div>
                ) : balances.length === 0 ? (
                    <div className="text-gray-500 text-sm">No balances yet.</div>
                ) : (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {balances.map(b => (
                            <div key={b.id} className="bg-gray-950/40 border border-gray-800 rounded-xl p-3">
                                <div className="text-xs text-gray-500">{getBalanceTypeName(b)}</div>
                                <div className="mt-1 flex items-baseline gap-2">
                                    <div className="text-lg font-bold text-white">{b.entitled_hours - b.used_hours}</div>
                                    <div className="text-xs text-gray-500">remaining</div>
                                </div>
                                <div className="text-xs text-gray-600 mt-1">{b.used_hours} used / {b.entitled_hours} entitled</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Request form */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <div className="text-sm font-semibold text-white mb-3">Apply for leave</div>
                {formError && (
                    <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm mb-4">
                        {formError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <span className="block text-gray-400 text-xs mb-2">Leave span *</span>
                        <div className="flex gap-1 p-1 rounded-xl bg-gray-950 border border-gray-800 max-w-md">
                            <button
                                type="button"
                                onClick={() => { setRangeMode('single'); setFormError(''); }}
                                className={`flex-1 text-sm py-2 px-3 rounded-lg transition ${rangeMode === 'single'
                                    ? 'bg-green-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                            >
                                Single day
                            </button>
                            <button
                                type="button"
                                onClick={() => { setRangeMode('range'); setFormError(''); }}
                                className={`flex-1 text-sm py-2 px-3 rounded-lg transition ${rangeMode === 'range'
                                    ? 'bg-green-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                            >
                                Multiple days
                            </button>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                            {rangeMode === 'single'
                                ? 'One calendar day; enter how many hours of leave that day.'
                                : 'Select first and last calendar day (inclusive). The same hours apply to each day; total = hours × number of days.'}
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-gray-400 text-xs mb-1">Leave type *</label>
                            <select
                                required
                                value={form.leave_type_id}
                                onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
                                className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                            >
                                <option value="">Select</option>
                                {loadingTypes ? (
                                    <option>Loading…</option>
                                ) : (
                                    types.filter(t => t.is_active).map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({(balanceByType[t.id]?.entitled_hours ?? t.yearly_entitlement_hours) - (balanceByType[t.id]?.used_hours ?? 0)}h left)
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="block text-gray-400 text-xs mb-1">Hours per day *</label>
                            <input
                                type="number"
                                min={1}
                                max={8}
                                step={1}
                                required
                                value={form.hours_per_day}
                                onChange={(e) => setForm({ ...form, hours_per_day: e.target.value })}
                                className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                            />
                            <p className="text-xs text-gray-600 mt-1">1–8 hours each calendar day in the selection.</p>
                        </div>
                    </div>

                    {rangeMode === 'single' ? (
                        <div>
                            <label className="block text-gray-400 text-xs mb-1">Date *</label>
                            <input
                                type="date"
                                required
                                value={form.single_date}
                                onChange={(e) => setForm({ ...form, single_date: e.target.value })}
                                className="w-full max-w-xs bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                            />
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">First day *</label>
                                <input
                                    type="date"
                                    required
                                    value={form.range_start}
                                    onChange={(e) => setForm({ ...form, range_start: e.target.value })}
                                    className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Last day *</label>
                                <input
                                    type="date"
                                    required
                                    value={form.range_end}
                                    onChange={(e) => setForm({ ...form, range_end: e.target.value })}
                                    className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                                />
                            </div>
                        </div>
                    )}

                    {leavePreview && (
                        <div className="bg-green-950/30 border border-green-800/50 rounded-xl px-4 py-3">
                            <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">How your leave will apply</div>
                            <ul className="text-sm text-gray-200 space-y-1.5 list-disc list-inside">
                                {leavePreview.lines.map((line, i) => (
                                    <li key={i} className="marker:text-green-500">{renderEmphasis(line)}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div>
                        <label className="block text-gray-400 text-xs mb-1">Reason</label>
                        <textarea
                            rows={3}
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                            className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500 resize-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={createMut.isPending || !leavePreview}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition"
                    >
                        {createMut.isPending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                        Submit request
                    </button>
                </form>
            </div>

            {/* Requests */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <div className="text-sm font-semibold text-white mb-3">My requests</div>
                {loadingRequests ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="animate-spin" size={16} /> Loading…</div>
                ) : requests.length === 0 ? (
                    <div className="text-gray-500 text-sm">No requests yet.</div>
                ) : (
                    <div className="space-y-3">
                        {requests.map(r => (
                            <div key={r.id} className="bg-gray-950/40 border border-gray-800 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-white">
                                            {r.leaveType?.name ?? r.leave_type?.name ?? `Type #${r.leave_type_id}`}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1"><Calendar size={12} /> {fmt(r.start_at)} → {fmt(r.end_at)}</span>
                                            <span className="text-gray-600">·</span>
                                            <span>{r.duration_hours}h total</span>
                                        </div>
                                        {r.reason && <div className="text-sm text-gray-400 mt-2">{r.reason}</div>}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                                        r.status === 'approved'
                                            ? 'bg-green-900/30 text-green-300 border-green-800/40'
                                            : r.status === 'rejected'
                                                ? 'bg-red-900/20 text-red-300 border-red-800/30'
                                                : 'bg-yellow-900/30 text-yellow-300 border-yellow-800/30'
                                    }`}>
                                        {r.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
