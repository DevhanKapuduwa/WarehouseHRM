import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { workerApi } from '../../api/workers';
import { User } from '../../types';
import {
    Plus, Edit2, Trash2, Search, X,
    ToggleLeft, ToggleRight, Loader2, Users, UserCircle, Brain, TrendingUp, AlertTriangle,
} from 'lucide-react';

// ── Emotion satisfaction (Rekognition % × weight) ─────────────────
/** Weights per Rekognition emotion Type. Unknown types contribute 0. */
const EMOTION_WEIGHTS: Record<string, number> = {
    HAPPY: 1.0,
    CALM: 0.8,
    SURPRISED: 0.6,
    CONFUSED: 0.4,
    SAD: 0.2,
    FEAR: 0.1,
    ANGRY: 0.0,
    DISGUSTED: 0.0,
};

/** Satisfaction = Σ(percentage × weight) / 100 — returns 0..1 */
function satisfactionForFace(emotions: Record<string, number> | undefined): number | null {
    if (!emotions || typeof emotions !== 'object') return null;
    let sum = 0;
    for (const [type, pct] of Object.entries(emotions)) {
        const w = EMOTION_WEIGHTS[type.toUpperCase()] ?? 0;
        sum += Number(pct) * w;
    }
    return sum / 100;
}

/** One score per photo: average satisfaction across detected faces. */
function satisfactionForPhoto(result: { faces?: { emotions?: Record<string, number> }[]; error?: string | null }): number | null {
    if (result.error || !result.faces?.length) return null;
    const scores = result.faces
        .map((f) => satisfactionForFace(f.emotions))
        .filter((s): s is number => s !== null);
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Average satisfaction across all photos that have a score (0–1 decimal; ×100 for %). */
function overallSatisfactionFromResults(results: any[] | undefined): { decimal: number; percent: number } | null {
    if (!results?.length) return null;
    const perPhoto = results.map((r) => satisfactionForPhoto(r)).filter((s): s is number => s !== null);
    if (perPhoto.length === 0) return null;
    const decimal = perPhoto.reduce((a, b) => a + b, 0) / perPhoto.length;
    return { decimal, percent: decimal * 100 };
}

/** Short, human-readable error (hide raw AWS JSON / long stack traces). */
function formatEmotionError(raw: string): string {
    if (!raw) return raw;
    if (raw.includes('InvalidSignatureException') || raw.includes('Signature expired')) {
        return 'AWS rejected the request — your PC clock is out of sync. Settings → Time & language → Date & time → Sync now, then try again.';
    }
    if (raw.startsWith('AWS signature expired')) return raw;
    return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}

const emptyMgrForm = {
    job_role: '',
    department: '',
    salary: '',
    work_location: '',
    training_hours: '',
    promotions: '',
    absenteeism: '',
    distance_from_home: '',
    manager_feedback_score: '',
    performance_rating: '',
};

const emptyForm = { name: '', email: '', password: '', employee_id: '', department: '', phone: '' };

export default function Workers() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const canManageWorkers = user?.role === 'management';
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<User | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
    const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
    const [mgrForm, setMgrForm] = useState(emptyMgrForm);
    const [profileErr, setProfileErr] = useState('');
    // emotion panel
    const [emotionWorkerId, setEmotionWorkerId] = useState<number | null>(null);
    const [emotionWorkerName, setEmotionWorkerName] = useState('');

    // churn panel
    const [showChurnPanel, setShowChurnPanel] = useState(false);

    const { data: churnData, isLoading: churnLoading, error: churnError, refetch: refetchChurn } = useQuery({
        queryKey: ['workers-churn'],
        queryFn: workerApi.getChurnAll,
        enabled: showChurnPanel,
        staleTime: 2 * 60_000,
        retry: false,
    });

    const { data: workers = [], isLoading } = useQuery({
        queryKey: ['workers'],
        queryFn: workerApi.getAll,
    });

    const createMut = useMutation({
        mutationFn: workerApi.create,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workers'] }); close(); },
        onError: (e: any) => setFormError(e.response?.data?.message || 'Failed to create'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) => workerApi.update(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workers'] }); close(); },
        onError: (e: any) => setFormError(e.response?.data?.message || 'Failed to update'),
    });

    const deleteMut = useMutation({
        mutationFn: workerApi.delete,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workers'] }); setDeleteConfirm(null); },
    });

    const toggleMut = useMutation({
        mutationFn: workerApi.toggleStatus,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['workers'] }),
    });

    const { data: profileDetail, isLoading: profileLoading } = useQuery({
        queryKey: ['worker', selectedProfileId],
        queryFn: () => workerApi.getById(selectedProfileId!),
        enabled: selectedProfileId !== null,
    });

    const { data: emotionData, isLoading: emotionLoading, error: emotionError } = useQuery({
        queryKey: ['worker-emotions', emotionWorkerId],
        queryFn: () => workerApi.getEmotionDetails(emotionWorkerId!),
        enabled: emotionWorkerId !== null,
        staleTime: 60_000,
    });

    useEffect(() => {
        if (!profileDetail) return;
        setMgrForm({
            job_role: profileDetail.job_role ?? '',
            department: profileDetail.department ?? '',
            salary: profileDetail.salary != null && profileDetail.salary !== '' ? String(profileDetail.salary) : '',
            work_location: profileDetail.work_location ?? '',
            training_hours: profileDetail.training_hours != null ? String(profileDetail.training_hours) : '',
            promotions: profileDetail.promotions != null ? String(profileDetail.promotions) : '',
            absenteeism: profileDetail.absenteeism != null ? String(profileDetail.absenteeism) : '',
            distance_from_home: profileDetail.distance_from_home != null ? String(profileDetail.distance_from_home) : '',
            manager_feedback_score:
                profileDetail.manager_feedback_score != null && profileDetail.manager_feedback_score !== ''
                    ? String(profileDetail.manager_feedback_score)
                    : '',
            performance_rating:
                profileDetail.performance_rating != null && profileDetail.performance_rating >= 1 && profileDetail.performance_rating <= 5
                    ? String(profileDetail.performance_rating)
                    : '',
        });
    }, [profileDetail]);

    const profileSaveMut = useMutation({
        mutationFn: () =>
            workerApi.update(selectedProfileId!, {
                job_role: mgrForm.job_role || undefined,
                department: mgrForm.department,
                salary: mgrForm.salary === '' ? undefined : Number(mgrForm.salary),
                work_location: mgrForm.work_location || undefined,
                training_hours: mgrForm.training_hours === '' ? undefined : Number(mgrForm.training_hours),
                promotions: mgrForm.promotions === '' ? undefined : Number(mgrForm.promotions),
                absenteeism: mgrForm.absenteeism === '' ? undefined : Number(mgrForm.absenteeism),
                distance_from_home: mgrForm.distance_from_home === '' ? undefined : Number(mgrForm.distance_from_home),
                manager_feedback_score:
                    mgrForm.manager_feedback_score === '' ? undefined : Number(mgrForm.manager_feedback_score),
                performance_rating:
                    mgrForm.performance_rating === ''
                        ? null
                        : Number.parseInt(mgrForm.performance_rating, 10),
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['worker', selectedProfileId] });
            qc.invalidateQueries({ queryKey: ['workers'] });
            qc.invalidateQueries({ queryKey: ['worker-emotions'] });
            setProfileErr('');
        },
        onError: (e: any) => setProfileErr(e.response?.data?.message || 'Save failed'),
    });

    const close = () => { setShowModal(false); setEditing(null); setForm(emptyForm); setFormError(''); };

    const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setShowModal(true); };

    const openEdit = (w: User) => {
        setEditing(w);
        setForm({ name: w.name, email: w.email, password: '', employee_id: w.employee_id, department: w.department, phone: w.phone || '' });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (editing) {
            const data: any = { name: form.name, email: form.email, employee_id: form.employee_id, department: form.department, phone: form.phone };
            if (form.password) data.password = form.password;
            updateMut.mutate({ id: editing.id, data });
        } else {
            if (!form.password) { setFormError('Password is required'); return; }
            createMut.mutate(form as any);
        }
    };

    const filtered = workers.filter(w =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.email.toLowerCase().includes(search.toLowerCase()) ||
        w.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
        w.department?.toLowerCase().includes(search.toLowerCase())
    );

    const isPending = createMut.isPending || updateMut.isPending;

    return (
        <div className="space-y-6">
            {/* ── Header ────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Users size={24} className="text-blue-400" /> Workers
                    <span className="text-sm font-normal text-gray-500 ml-2">({workers.length})</span>
                </h1>
                <div className="flex items-center gap-2">
                    {canManageWorkers && (
                        <button
                            onClick={() => setShowChurnPanel(true)}
                            className="bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition"
                        >
                            <TrendingUp size={16} /> Churn Analysis
                        </button>
                    )}
                    {canManageWorkers && (
                        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition">
                            <Plus size={16} /> Add Worker
                        </button>
                    )}
                </div>
            </div>

            {/* ── Search ────────────────────────────────── */}
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, email, ID, or department..."
                    className="w-full bg-gray-900 text-white text-sm pl-10 pr-4 py-3 rounded-xl border border-gray-800 focus:border-blue-500 focus:outline-none"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* ── Table ─────────────────────────────────── */}
            {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                    {search ? 'No workers match your search' : 'No workers yet — add one above!'}
                </div>
            ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                                <th className="text-left px-5 py-4">Worker</th>
                                <th className="text-left px-5 py-4 hidden md:table-cell">Employee ID</th>
                                <th className="text-left px-5 py-4 hidden lg:table-cell">Department</th>
                                <th className="text-left px-5 py-4 hidden lg:table-cell">Phone</th>
                                <th className="text-center px-5 py-4">Tasks</th>
                                <th className="text-center px-5 py-4">Status</th>
                                <th className="text-right px-5 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {filtered.map(w => (
                                <tr key={w.id} className="hover:bg-gray-800/40 transition">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${w.is_active ? 'bg-blue-600' : 'bg-gray-700 text-gray-400'}`}>
                                                {w.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium">{w.name}</p>
                                                <p className="text-xs text-gray-500">{w.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-300 hidden md:table-cell font-mono text-xs">{w.employee_id}</td>
                                    <td className="px-5 py-4 text-gray-300 hidden lg:table-cell">{w.department}</td>
                                    <td className="px-5 py-4 text-gray-400 hidden lg:table-cell">{w.phone || '—'}</td>
                                    <td className="px-5 py-4 text-center">
                                        <span className="bg-gray-800 px-2.5 py-1 rounded-full text-xs font-medium text-gray-300">
                                            {w.tasks_count ?? 0}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        {canManageWorkers ? (
                                            <button
                                                onClick={() => toggleMut.mutate(w.id)}
                                                title={w.is_active ? 'Deactivate' : 'Activate'}
                                                className="transition hover:scale-110"
                                            >
                                                {w.is_active
                                                    ? <ToggleRight size={24} className="text-green-400" />
                                                    : <ToggleLeft size={24} className="text-gray-600" />
                                                }
                                            </button>
                                        ) : (
                                            <span title={w.is_active ? 'Active' : 'Inactive'}>
                                                {w.is_active
                                                    ? <ToggleRight size={24} className="text-green-400/70" />
                                                    : <ToggleLeft size={24} className="text-gray-600" />
                                                }
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                title="Employee profile"
                                                onClick={() => { setSelectedProfileId(w.id); setProfileErr(''); }}
                                                className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition"
                                            >
                                                <UserCircle size={17} />
                                            </button>
                                            {/* ── View Emotional Details ── */}
                                            <button
                                                type="button"
                                                title="View Emotional Details"
                                                onClick={() => { setEmotionWorkerId(w.id); setEmotionWorkerName(w.name); }}
                                                className="p-2 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-gray-800 transition"
                                            >
                                                <Brain size={16} />
                                            </button>
                                            {canManageWorkers && (
                                                <>
                                                    <button onClick={() => openEdit(w)} className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-800 transition">
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button onClick={() => setDeleteConfirm(w.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Churn Analysis Slide-over ───────────────────────────────── */}
            {showChurnPanel && (
                <div
                    className="fixed inset-0 z-50 flex justify-end bg-black/60"
                    onClick={() => setShowChurnPanel(false)}
                >
                    <div
                        className="w-full max-w-2xl h-full bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <TrendingUp size={20} className="text-violet-400" />
                                Churn Risk Analysis
                                <span className="text-xs font-normal text-gray-400 ml-1">— All Workers</span>
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => refetchChurn()}
                                    className="text-gray-400 hover:text-violet-300 p-1 rounded-lg hover:bg-gray-800 text-xs px-2 py-1 border border-gray-700 flex items-center gap-1"
                                    title="Refresh predictions"
                                >
                                    <Loader2 size={12} className={churnLoading ? 'animate-spin' : ''} />
                                    Refresh
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowChurnPanel(false)}
                                    className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
                                >
                                    <X size={22} />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 pb-24 space-y-5">
                            {/* Service-offline warning */}
                            {!churnLoading && churnError && (
                                <div className="bg-amber-900/25 border border-amber-700/50 text-amber-300 px-4 py-4 rounded-xl text-sm space-y-2">
                                    <p className="flex items-center gap-2 font-semibold">
                                        <AlertTriangle size={16} /> Churn service is not running
                                    </p>
                                    <p className="text-amber-400/80 text-xs leading-relaxed">
                                        Start the FastAPI service in a separate terminal before using churn analysis:
                                    </p>
                                    <pre className="bg-black/40 text-green-300 text-xs rounded-lg px-3 py-2 overflow-x-auto">{`cd "D:\\Data managment\\model"
uvicorn churn_api:app --host 0.0.0.0 --port 8001 --reload`}</pre>
                                </div>
                            )}

                            {churnLoading && (
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <Loader2 className="animate-spin text-violet-400" size={36} />
                                    <p className="text-gray-500 text-sm">Running churn predictions for all workers…</p>
                                </div>
                            )}

                            {!churnLoading && churnData && (() => {
                                const results: any[] = churnData.results ?? [];
                                const threshold: number | null = churnData.threshold ?? null;

                                const highRisk = results.filter((r: any) => r.risk_label === 'High');
                                const medRisk  = results.filter((r: any) => r.risk_label === 'Medium');
                                const lowRisk  = results.filter((r: any) => r.risk_label === 'Low');

                                return (
                                    <>
                                        {/* Summary strip */}
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { label: 'High Risk', count: highRisk.length, color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40' },
                                                { label: 'Medium Risk', count: medRisk.length, color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-800/40' },
                                                { label: 'Low Risk', count: lowRisk.length, color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-800/40' },
                                            ].map(s => (
                                                <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
                                                    <p className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.count}</p>
                                                    <p className="text-gray-400 text-xs mt-0.5">{s.label}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {threshold !== null && (
                                            <p className="text-xs text-gray-600">
                                                Decision threshold: <span className="font-mono text-gray-400">{threshold}</span>
                                                &nbsp;·&nbsp;High ≥ 0.65&nbsp;·&nbsp;Medium ≥ 0.40&nbsp;·&nbsp;Low &lt; 0.40
                                            </p>
                                        )}

                                        {results.length === 0 && (
                                            <p className="text-center py-12 text-gray-500">No active workers found.</p>
                                        )}

                                        {/* Per-worker rows */}
                                        <div className="space-y-2">
                                            {results.map((r: any, idx: number) => {
                                                const prob = r.churn_prob ?? 0;
                                                const pct  = Math.round(prob * 100);
                                                const isHigh   = r.risk_label === 'High';
                                                const isMedium = r.risk_label === 'Medium';
                                                const barColor = isHigh ? 'bg-red-500' : isMedium ? 'bg-amber-500' : 'bg-emerald-500';
                                                const labelColor = isHigh ? 'text-red-300 bg-red-900/30 border-red-700/50'
                                                    : isMedium ? 'text-amber-300 bg-amber-900/30 border-amber-700/50'
                                                    : 'text-emerald-300 bg-emerald-900/30 border-emerald-700/50';

                                                return (
                                                    <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 hover:border-violet-800/40 transition">
                                                        <div className="flex items-center justify-between gap-3 mb-2">
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                                                                <p className="text-xs text-gray-500 truncate">
                                                                    {r.job_role || r.department
                                                                        ? [r.job_role, r.department].filter(Boolean).join(' · ')
                                                                        : r.employee_id}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <span className="text-sm font-bold tabular-nums text-white">
                                                                    {r.churn_prob != null ? `${pct}%` : '—'}
                                                                </span>
                                                                <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${labelColor}`}>
                                                                    {r.risk_label}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {/* Probability bar */}
                                                        <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${barColor}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create / Edit Modal ───────────────────── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="text-lg font-bold">{editing ? 'Edit Worker' : 'Add Worker'}</h3>
                            <button onClick={close} className="text-gray-400 hover:text-white transition"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            {formError && (
                                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2.5 rounded-lg text-sm">{formError}</div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Name *</label>
                                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Employee ID *</label>
                                    <input required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Email *</label>
                                <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </div>

                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Password {editing ? '(leave blank to keep)' : '*'}</label>
                                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                                    {...(!editing && { required: true })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Department *</label>
                                    <input required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Phone</label>
                                    <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={close} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                                <button type="submit" disabled={isPending}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg transition flex items-center gap-2">
                                    {isPending && <Loader2 size={14} className="animate-spin" />}
                                    {editing ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm ────────────────────────── */}
            {/* ── Employee profile (management) ─────────── */}
            {selectedProfileId !== null && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setSelectedProfileId(null)}>
                    <div
                        className="w-full max-w-xl h-full bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <UserCircle size={22} className="text-cyan-400" /> Employee profile
                            </h2>
                            <button
                                type="button"
                                onClick={() => setSelectedProfileId(null)}
                                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="p-5 space-y-8 pb-24">
                            {profileLoading || !profileDetail ? (
                                <div className="flex justify-center py-20">
                                    <Loader2 className="animate-spin text-cyan-400" size={28} />
                                </div>
                            ) : (
                                <>
                                    <section>
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Identity</h3>
                                        <dl className="space-y-2 text-sm">
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Employee ID</dt>
                                                <dd className="font-mono text-gray-200">{profileDetail.employee_id}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Name</dt>
                                                <dd className="text-gray-200">{profileDetail.name}</dd>
                                            </div>
                                        </dl>
                                    </section>

                                    <section>
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                            Employee-entered
                                        </h3>
                                        <p className="text-xs text-gray-600 mb-3">Workers update these in My Profile. Read-only here.</p>
                                        <dl className="space-y-2 text-sm">
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Age</dt>
                                                <dd className="text-gray-200">{profileDetail.age ?? '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Gender</dt>
                                                <dd className="text-gray-200">{profileDetail.gender ?? '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Education</dt>
                                                <dd className="text-gray-200 text-right">{profileDetail.education_level ?? '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Marital status</dt>
                                                <dd className="text-gray-200">{profileDetail.marital_status ?? '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Joined date</dt>
                                                <dd className="text-gray-200">
                                                    {profileDetail.joined_date
                                                        ? String(profileDetail.joined_date).slice(0, 10)
                                                        : '—'}
                                                </dd>
                                            </div>
                                        </dl>
                                    </section>

                                    <section>
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                            Calculated from activity
                                        </h3>
                                        <p className="text-xs text-gray-600 mb-3">
                                            Work–life balance uses engagement attendance. Overtime and absenteeism use 8h days, completed clock sessions, and scheduled shifts (lateness vs shift start; missed shift day = 8h shortage). Figures are per calendar month.
                                        </p>
                                        <dl className="space-y-2 text-sm">
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Tenure</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.tenure?.label ?? '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Projects completed</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.projects_completed ?? 0}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Hours worked (this month)</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.total_hours_worked_this_month ?? 0}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Overtime hours (this month)</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.overtime_hours ?? 0}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Absenteeism units (this month)</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.absenteeism_units ?? 0}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Shortage remainder (this month, h)</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.shortage_hours_remainder ?? 0}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Avg. monthly hours worked</dt>
                                                <dd className="text-gray-200">{profileDetail.profile_metrics?.average_monthly_hours_worked ?? 0}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Engagement attendance %</dt>
                                                <dd className="text-gray-200">
                                                    {profileDetail.profile_metrics?.engagement_attendance_pct != null
                                                        ? `${profileDetail.profile_metrics.engagement_attendance_pct}%`
                                                        : '—'}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-gray-500">Work–life balance</dt>
                                                <dd className="text-gray-200 font-medium">
                                                    {profileDetail.profile_metrics?.work_life_balance ?? '—'}
                                                </dd>
                                            </div>
                                        </dl>
                                        {profileDetail.profile_metrics?.monthly_work_stats &&
                                            profileDetail.profile_metrics.monthly_work_stats.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-gray-800">
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By month</h4>
                                                <div className="overflow-x-auto text-xs">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="text-gray-500 border-b border-gray-800">
                                                                <th className="py-1 pr-2">Month</th>
                                                                <th className="py-1 pr-2">Worked (h)</th>
                                                                <th className="py-1 pr-2">OT (h)</th>
                                                                <th className="py-1 pr-2">Absent. units</th>
                                                                <th className="py-1 pr-2">Short. rem. (h)</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {[...profileDetail.profile_metrics.monthly_work_stats].reverse().slice(0, 12).map((row) => (
                                                                <tr key={row.year_month} className="border-b border-gray-800/60 text-gray-300">
                                                                    <td className="py-1 pr-2 font-mono">{row.year_month}</td>
                                                                    <td className="py-1 pr-2">{row.total_hours_worked}</td>
                                                                    <td className="py-1 pr-2">{row.overtime_hours}</td>
                                                                    <td className="py-1 pr-2">{row.absenteeism_units}</td>
                                                                    <td className="py-1 pr-2">{row.shortage_hours_remainder}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    <section>
                                        <h3 className="text-xs font-semibold text-cyan-500/90 uppercase tracking-wider mb-3">
                                            Management fields
                                        </h3>
                                        {canManageWorkers ? (
                                            <>
                                                {profileErr && (
                                                    <div className="mb-3 bg-red-900/30 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm">
                                                        {profileErr}
                                                    </div>
                                                )}
                                                <form
                                                    className="space-y-3"
                                                    onSubmit={e => {
                                                        e.preventDefault();
                                                        profileSaveMut.mutate();
                                                    }}
                                                >
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Job role</label>
                                                        <input
                                                            value={mgrForm.job_role}
                                                            onChange={e => setMgrForm({ ...mgrForm, job_role: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Department *</label>
                                                        <input
                                                            required
                                                            value={mgrForm.department}
                                                            onChange={e => setMgrForm({ ...mgrForm, department: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Salary</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step={0.01}
                                                            value={mgrForm.salary}
                                                            onChange={e => setMgrForm({ ...mgrForm, salary: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Work location</label>
                                                        <select
                                                            value={mgrForm.work_location}
                                                            onChange={e => setMgrForm({ ...mgrForm, work_location: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        >
                                                            <option value="">—</option>
                                                            <option value="Remote">Remote</option>
                                                            <option value="On-site">On-site</option>
                                                            <option value="Hybrid">Hybrid</option>
                                                        </select>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-gray-500 text-xs mb-1">Training hours</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={mgrForm.training_hours}
                                                                onChange={e => setMgrForm({ ...mgrForm, training_hours: e.target.value })}
                                                                className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-gray-500 text-xs mb-1">Promotions</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={mgrForm.promotions}
                                                                onChange={e => setMgrForm({ ...mgrForm, promotions: e.target.value })}
                                                                className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Absenteeism (days)</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={mgrForm.absenteeism}
                                                            onChange={e => setMgrForm({ ...mgrForm, absenteeism: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Distance from home (km)</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={mgrForm.distance_from_home}
                                                            onChange={e => setMgrForm({ ...mgrForm, distance_from_home: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Manager feedback score (0–10)</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={10}
                                                            step={0.1}
                                                            value={mgrForm.manager_feedback_score}
                                                            onChange={e => setMgrForm({ ...mgrForm, manager_feedback_score: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-500 text-xs mb-1">Performance rating (1–5)</label>
                                                        <select
                                                            value={mgrForm.performance_rating}
                                                            onChange={e => setMgrForm({ ...mgrForm, performance_rating: e.target.value })}
                                                            className="w-full bg-gray-900 text-white text-sm px-3 py-2 rounded-lg border border-gray-800 focus:border-cyan-500 focus:outline-none"
                                                        >
                                                            <option value="">— Not set</option>
                                                            <option value="1">1 — Lowest</option>
                                                            <option value="2">2</option>
                                                            <option value="3">3</option>
                                                            <option value="4">4</option>
                                                            <option value="5">5 — Highest</option>
                                                        </select>
                                                    </div>
                                                    <button
                                                        type="submit"
                                                        disabled={profileSaveMut.isPending}
                                                        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg flex items-center justify-center gap-2"
                                                    >
                                                        {profileSaveMut.isPending && <Loader2 size={16} className="animate-spin" />}
                                                        Save management fields
                                                    </button>
                                                </form>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xs text-gray-600 mb-3">
                                                    Read-only. Editing is limited to management accounts.
                                                </p>
                                                <dl className="space-y-2 text-sm">
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Job role</dt>
                                                        <dd className="text-gray-200 text-right">{profileDetail.job_role ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Department</dt>
                                                        <dd className="text-gray-200 text-right">{profileDetail.department ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Salary</dt>
                                                        <dd className="text-gray-200 text-right">{profileDetail.salary ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Work location</dt>
                                                        <dd className="text-gray-200 text-right">{profileDetail.work_location ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Training hours</dt>
                                                        <dd className="text-gray-200">{profileDetail.training_hours ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Promotions</dt>
                                                        <dd className="text-gray-200">{profileDetail.promotions ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Absenteeism (days)</dt>
                                                        <dd className="text-gray-200">{profileDetail.absenteeism ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Distance from home (km)</dt>
                                                        <dd className="text-gray-200">{profileDetail.distance_from_home ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Manager feedback score</dt>
                                                        <dd className="text-gray-200">{profileDetail.manager_feedback_score ?? '—'}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <dt className="text-gray-500">Performance rating</dt>
                                                        <dd className="text-gray-200">
                                                            {profileDetail.performance_rating != null
                                                                ? `${profileDetail.performance_rating}/5`
                                                                : '—'}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </>
                                        )}
                                    </section>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Emotion Details Slide-over ─────────────────────── */}
            {emotionWorkerId !== null && (
                <div
                    className="fixed inset-0 z-50 flex justify-end bg-black/60"
                    onClick={() => setEmotionWorkerId(null)}
                >
                    <div
                        className="w-full max-w-2xl h-full bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Brain size={20} className="text-purple-400" />
                                Emotional Details
                                <span className="text-sm font-normal text-gray-400 ml-1">— {emotionWorkerName}</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => setEmotionWorkerId(null)}
                                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="p-5 pb-24 space-y-6">
                            {emotionLoading && (
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <Loader2 className="animate-spin text-purple-400" size={36} />
                                    <p className="text-gray-500 text-sm">Analysing photos via AWS Rekognition…</p>
                                </div>
                            )}

                            {!emotionLoading && emotionError && (
                                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-xl text-sm">
                                    Failed to load emotion data. Check that the worker has photos in the database folder.
                                </div>
                            )}

                            {!emotionLoading && emotionData && (() => {
                                const analysis = emotionData.emotion_analysis;
                                const workerPayload = emotionData.worker as { performance_rating?: number | null } | undefined;
                                if (!analysis) return null;

                                const overall = overallSatisfactionFromResults(analysis.results as any[]);

                                return (
                                    <>
                                        {/* Summary strip */}
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { label: 'Total Photos', value: analysis.total_photos },
                                                { label: 'Analysed', value: analysis.analysed, color: 'text-green-400' },
                                                { label: 'Errors', value: analysis.errors, color: analysis.errors > 0 ? 'text-red-400' : 'text-gray-400' },
                                            ].map(s => (
                                                <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                                                    <p className={`text-2xl font-bold ${s.color ?? 'text-white'}`}>{s.value}</p>
                                                    <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {analysis.total_photos === 0 && (
                                            <div className="text-center py-12 text-gray-500">
                                                <Brain size={40} className="mx-auto mb-3 text-gray-700" />
                                                No photos found for this worker yet.<br />
                                                <span className="text-xs">Run step8 to capture snapshots during attendance.</span>
                                            </div>
                                        )}

                                        {/* Per-photo cards */}
                                        {(analysis.results as any[]).map((result: any, idx: number) => {
                                            const sat = satisfactionForPhoto(result);
                                            const satPct = sat !== null ? sat * 100 : null;
                                            return (
                                            <div key={idx} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                                {/* Photo header */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-white truncate max-w-xs">{result.photo}</p>
                                                        {result.captured_at && (
                                                            <p className="text-xs text-gray-500 mt-0.5">📅 {result.captured_at}</p>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                                                        result.error
                                                            ? 'bg-red-900/50 text-red-300'
                                                            : result.faces_detected === 0
                                                            ? 'bg-gray-800 text-gray-500'
                                                            : 'bg-purple-900/60 text-purple-300'
                                                    }`}>
                                                        {result.error ? 'Error' : `${result.faces_detected} face${result.faces_detected !== 1 ? 's' : ''}`}
                                                    </span>
                                                </div>

                                                {result.error && (
                                                    <p className="px-4 py-3 text-xs text-red-300 leading-relaxed">{formatEmotionError(String(result.error))}</p>
                                                )}

                                                {!result.error && result.faces_detected === 0 && (
                                                    <p className="px-4 py-3 text-xs text-gray-500">No face detected in this image.</p>
                                                )}

                                                {!result.error && result.faces_detected > 0 && satPct !== null && (
                                                    <div className="px-4 py-5">
                                                        <p className="text-xs text-gray-500 mb-2">Satisfaction</p>
                                                        <p className="text-3xl font-bold tabular-nums text-emerald-400">{satPct.toFixed(1)}%</p>
                                                        <p className="text-[11px] text-gray-600 mt-2 leading-snug">
                                                            Σ(percentage × weight) ÷ 100 per face; multiple faces are averaged for this photo.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })}

                                        {analysis.total_photos > 0 && overall && (
                                            <div className="bg-gray-900 border border-emerald-800/40 rounded-2xl p-5 space-y-3 mt-2">
                                                <p className="text-xs text-gray-500 uppercase tracking-wide">Overall satisfaction</p>
                                                <p className="text-3xl font-bold tabular-nums text-emerald-400">
                                                    {overall.percent.toFixed(2)}%
                                                </p>
                                                <p className="text-sm text-gray-400">
                                                    Decimal:{' '}
                                                    <span className="font-mono text-white">{overall.decimal.toFixed(4)}</span>
                                                </p>
                                                <p className="text-[11px] text-gray-600 leading-snug">
                                                    Mean of every photo that has a satisfaction score (same formula as per photo).
                                                </p>
                                                {workerPayload?.performance_rating != null && (
                                                    <p className="text-sm text-gray-400 pt-2 border-t border-gray-800">
                                                        Performance rating (management):{' '}
                                                        <span className="text-white font-semibold">{workerPayload.performance_rating}/5</span>
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirm !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                        <Trash2 size={32} className="text-red-400 mx-auto mb-3" />
                        <h3 className="text-lg font-bold mb-1">Delete Worker?</h3>
                        <p className="text-gray-400 text-sm mb-5">This action cannot be undone. All related tasks and time logs will also be removed.</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setDeleteConfirm(null)} className="px-5 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition">Cancel</button>
                            <button
                                onClick={() => deleteMut.mutate(deleteConfirm)}
                                disabled={deleteMut.isPending}
                                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg transition flex items-center gap-2">
                                {deleteMut.isPending && <Loader2 size={14} className="animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}