import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../../api/tasks';
import { workerApi } from '../../api/workers';
import { Task } from '../../types';
import {
    Plus, Edit2, Trash2, X, Loader2, ClipboardList,
    Filter, Calendar, MapPin, AlertCircle, CheckCircle2,
    XCircle, Image, ChevronDown, ChevronRight, GitBranch
} from 'lucide-react';
import { TaskLocationPicker } from '../../components/maps/TaskLocationPicker';

const statusBadge: Record<string, string> = {
    pending: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50',
    in_progress: 'bg-blue-900/40   text-blue-400   border border-blue-700/50',
    completed: 'bg-green-900/40  text-green-400  border border-green-700/50',
    cancelled: 'bg-red-900/40    text-red-400    border border-red-700/50',
    pending_approval: 'bg-purple-900/40 text-purple-400 border border-purple-700/50',
};

const priorityBadge: Record<string, string> = {
    low: 'bg-gray-800 text-gray-400 border border-gray-700',
    medium: 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50',
    high: 'bg-red-900/30 text-red-400 border border-red-700/50',
};

interface SubTaskForm {
    id?: number;
    title: string;
    description: string;
}

const emptyForm = {
    title: '',
    description: '',
    worker_id: '',
    priority: 'medium',
    has_subtasks: false,
    location: '',
    location_text: '',
    location_lat: '',
    location_lng: '',
    place_id: '',
    place_name: '',
    place_address: '',
    due_date: '',
    subtasks: [] as SubTaskForm[],
};

export default function Tasks() {
    const qc = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Task | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
    const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
    const [approvalModal, setApprovalModal] = useState<Task | null>(null);
    const [rejectionNotes, setRejectionNotes] = useState('');
    const [photoViewTask, setPhotoViewTask] = useState<Task | null>(null);

    const { data: tasks = [], isLoading } = useQuery({
        queryKey: ['tasks', statusFilter, priorityFilter],
        queryFn: () => taskApi.getAll({
            ...(statusFilter && { status: statusFilter }),
            ...(priorityFilter && { priority: priorityFilter } as any),
        }),
    });

    const { data: workers = [] } = useQuery({
        queryKey: ['workers'],
        queryFn: workerApi.getAll,
    });

    const createMut = useMutation({
        mutationFn: (data: any) => taskApi.create(data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); close(); },
        onError: (e: any) => setFormError(e.response?.data?.message || 'Failed'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) => taskApi.update(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); close(); },
        onError: (e: any) => setFormError(e.response?.data?.message || 'Failed'),
    });

    const statusMut = useMutation({
        mutationFn: ({ id, status }: { id: number; status: Task['status'] }) => taskApi.updateStatus(id, status),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    });

    const deleteMut = useMutation({
        mutationFn: taskApi.delete,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setDeleteConfirm(null); },
    });

    const approveMut = useMutation({
        mutationFn: ({ id, notes }: { id: number; notes?: string }) => taskApi.approveCompletion(id, notes),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setApprovalModal(null); },
    });

    const rejectMut = useMutation({
        mutationFn: ({ id, notes }: { id: number; notes: string }) => taskApi.rejectCompletion(id, notes),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setApprovalModal(null); setRejectionNotes(''); },
    });

    const close = () => { setShowModal(false); setEditing(null); setForm(emptyForm); setFormError(''); };

    const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setShowModal(true); };

    const openEdit = (t: Task) => {
        setEditing(t);
        setForm({
            title: t.title,
            description: t.description || '',
            worker_id: String(t.assigned_to),
            priority: t.priority,
            has_subtasks: t.has_subtasks || false,
            location: t.location || '',
            location_text: t.location_text || '',
            location_lat: t.location_lat != null ? String(t.location_lat) : '',
            location_lng: t.location_lng != null ? String(t.location_lng) : '',
            place_id: t.place_id || '',
            place_name: t.place_name || '',
            place_address: t.place_address || '',
            due_date: t.due_date ? t.due_date.slice(0, 16) : '',
            subtasks: (t.subtasks || []).map(s => ({
                id: s.id,
                title: s.title,
                description: s.description || '',
            })),
        });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const payload: any = {
            title: form.title,
            description: form.description || null,
            worker_id: Number(form.worker_id),
            priority: form.priority,
            has_subtasks: form.has_subtasks,
            location: form.location || null,
            location_text: form.location_text || null,
            location_lat: form.location_lat ? Number(form.location_lat) : null,
            location_lng: form.location_lng ? Number(form.location_lng) : null,
            place_id: form.place_id || null,
            place_name: form.place_name || null,
            place_address: form.place_address || null,
            due_date: form.due_date || null,
        };
        if (form.has_subtasks && form.subtasks.length > 0) {
            payload.subtasks = form.subtasks.map(s => ({
                ...(s.id ? { id: s.id } : {}),
                title: s.title,
                description: s.description || null,
            }));
        }
        if (editing) {
            updateMut.mutate({ id: editing.id, data: payload });
        } else {
            createMut.mutate(payload);
        }
    };

    const addSubTask = () => {
        setForm({
            ...form,
            subtasks: [...form.subtasks, { title: '', description: '' }],
        });
    };

    const removeSubTask = (idx: number) => {
        setForm({
            ...form,
            subtasks: form.subtasks.filter((_, i) => i !== idx),
        });
    };

    const updateSubTask = (idx: number, field: keyof SubTaskForm, value: string) => {
        const updated = [...form.subtasks];
        (updated[idx] as any)[field] = value;
        setForm({ ...form, subtasks: updated });
    };

    const toggleExpand = (id: number) => {
        const next = new Set(expandedTasks);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedTasks(next);
    };

    const isPending = createMut.isPending || updateMut.isPending;

    const fmtDate = (d: string | null) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const pendingApprovalTasks = tasks.filter(t => t.status === 'pending_approval' || (t.subtasks || []).some(s => s.status === 'pending_approval'));

    return (
        <div className="space-y-6">
            {/* ── Header ────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ClipboardList size={24} className="text-blue-400" /> Tasks
                    <span className="text-sm font-normal text-gray-500 ml-2">({tasks.length})</span>
                </h1>
                <div className="flex gap-3">
                    {pendingApprovalTasks.length > 0 && (
                        <span className="bg-purple-600/20 text-purple-400 border border-purple-700/50 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 animate-pulse">
                            <AlertCircle size={14} /> {pendingApprovalTasks.length} awaiting approval
                        </span>
                    )}
                    <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition">
                        <Plus size={16} /> New Task
                    </button>
                </div>
            </div>

            {/* ── Filters ───────────────────────────────── */}
            <div className="flex flex-wrap gap-3 items-center">
                <Filter size={16} className="text-gray-400" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="bg-gray-900 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-blue-500">
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                    className="bg-gray-900 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-blue-500">
                    <option value="">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
                {(statusFilter || priorityFilter) && (
                    <button onClick={() => { setStatusFilter(''); setPriorityFilter(''); }}
                        className="text-xs text-gray-400 hover:text-white transition">Clear</button>
                )}
            </div>

            {/* ── Task Cards ────────────────────────────── */}
            {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-16 text-gray-500">No tasks found</div>
            ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {tasks.map(t => (
                        <div key={t.id} className={`bg-gray-900 rounded-xl border p-5 flex flex-col hover:border-gray-700 transition group ${t.status === 'pending_approval' ? 'border-purple-700/50 ring-1 ring-purple-500/20' : 'border-gray-800'}`}>
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    {t.has_subtasks && (
                                        <button onClick={() => toggleExpand(t.id)} className="text-gray-400 hover:text-white transition">
                                            {expandedTasks.has(t.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                    )}
                                    <h3 className="font-semibold text-white leading-snug">{t.title}</h3>
                                    {t.has_subtasks && (
                                        <span className="text-xs text-gray-500 flex items-center gap-1"><GitBranch size={10} />{(t.subtasks || []).length}</span>
                                    )}
                                </div>
                                <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => openEdit(t)} className="p-1.5 rounded text-gray-400 hover:text-blue-400 hover:bg-gray-800"><Edit2 size={13} /></button>
                                    <button onClick={() => setDeleteConfirm(t.id)} className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-800"><Trash2 size={13} /></button>
                                </div>
                            </div>

                            {t.description && <p className="text-gray-400 text-xs mb-3 line-clamp-2">{t.description}</p>}

                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge[t.status]}`}>{t.status.replace(/_/g, ' ')}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs ${priorityBadge[t.priority]}`}>{t.priority}</span>
                            </div>

                            {/* Approval Notes (if rejected) */}
                            {t.approval_notes && t.status === 'in_progress' && (
                                <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2 mb-3">
                                    <p className="text-red-400 text-xs"><strong>Rejection note:</strong> {t.approval_notes}</p>
                                </div>
                            )}

                            {/* Completion photos preview */}
                            {t.completion_photos && t.completion_photos.length > 0 && (
                                <button onClick={() => setPhotoViewTask(t)} className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 mb-3 transition">
                                    <Image size={12} /> {t.completion_photos.length} completion photo(s)
                                </button>
                            )}

                            <div className="space-y-1.5 text-xs text-gray-400 mt-auto">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-5 h-5 bg-blue-600/30 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-400">
                                        {t.worker?.name?.charAt(0) || '?'}
                                    </span>
                                    {t.worker?.name || 'Unassigned'} <span className="text-gray-600">#{t.worker?.employee_id}</span>
                                </div>
                                {t.location && <div className="flex items-center gap-1.5"><MapPin size={12} className="text-gray-500" /> {t.location}</div>}
                                {t.due_date && <div className="flex items-center gap-1.5"><Calendar size={12} className="text-gray-500" /> Due {fmtDate(t.due_date)}</div>}
                            </div>

                            {/* Sub-tasks expanded */}
                            {t.has_subtasks && expandedTasks.has(t.id) && (t.subtasks || []).length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Sub-tasks</p>
                                    {(t.subtasks || []).map(sub => (
                                        <div key={sub.id} className={`pl-3 border-l-2 py-2 ${sub.status === 'pending_approval' ? 'border-purple-500' : 'border-gray-700'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-300">{sub.title}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusBadge[sub.status]}`}>{sub.status.replace(/_/g, ' ')}</span>
                                            </div>
                                            {sub.description && <p className="text-gray-500 text-xs mt-0.5">{sub.description}</p>}
                                            {sub.completion_photos && sub.completion_photos.length > 0 && (
                                                <button onClick={() => setPhotoViewTask(sub)} className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 mt-1">
                                                    <Image size={10} /> {sub.completion_photos.length} photo(s)
                                                </button>
                                            )}
                                            {sub.status === 'pending_approval' && (
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={() => approveMut.mutate({ id: sub.id })} className="bg-green-600 hover:bg-green-700 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 transition">
                                                        <CheckCircle2 size={10} /> Approve
                                                    </button>
                                                    <button onClick={() => { setApprovalModal(sub); setRejectionNotes(''); }} className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 transition">
                                                        <XCircle size={10} /> Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Quick status / Approval buttons */}
                            <div className="mt-4 pt-3 border-t border-gray-800">
                                {t.status === 'pending_approval' ? (
                                    <div className="flex gap-2">
                                        <button onClick={() => approveMut.mutate({ id: t.id })}
                                            disabled={approveMut.isPending}
                                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition">
                                            {approveMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approve
                                        </button>
                                        <button onClick={() => { setApprovalModal(t); setRejectionNotes(''); }}
                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition">
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </div>
                                ) : (
                                    <select
                                        value={t.status}
                                        onChange={e => statusMut.mutate({ id: t.id, status: e.target.value as Task['status'] })}
                                        className="w-full bg-gray-800 text-gray-300 text-xs px-2 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="pending_approval">Pending Approval</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Create / Edit Modal ───────────────────── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="text-lg font-bold">{editing ? 'Edit Task' : 'New Task'}</h3>
                            <button onClick={close} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            {formError && <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2.5 rounded-lg text-sm">{formError}</div>}

                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Title *</label>
                                <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </div>

                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Description</label>
                                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    rows={3} className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Assign to *</label>
                                    <select required value={form.worker_id} onChange={e => setForm({ ...form, worker_id: e.target.value })}
                                        className="w-full bg-gray-800 text-gray-300 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none">
                                        <option value="">Select worker</option>
                                        {workers.filter(w => w.is_active).map(w => (
                                            <option key={w.id} value={w.id}>{w.name} ({w.employee_id})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Priority *</label>
                                    <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                                        className="w-full bg-gray-800 text-gray-300 text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none">
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                            </div>

                            {/* ── Sub-tasks toggle ───────────────── */}
                            <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700/50">
                                <div>
                                    <p className="text-sm text-white font-medium">Enable Sub-tasks</p>
                                    <p className="text-xs text-gray-500">Break this work into smaller tasks</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, has_subtasks: !form.has_subtasks })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${form.has_subtasks ? 'bg-blue-600' : 'bg-gray-600'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${form.has_subtasks ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* ── Sub-tasks list ───────────────── */}
                            {form.has_subtasks && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Sub-tasks</label>
                                        <button type="button" onClick={addSubTask}
                                            className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 transition">
                                            <Plus size={12} /> Add Sub-task
                                        </button>
                                    </div>
                                    {form.subtasks.length === 0 && (
                                        <p className="text-xs text-gray-600 text-center py-3">No sub-tasks added yet. Click "Add Sub-task" above.</p>
                                    )}
                                    {form.subtasks.map((sub, idx) => (
                                        <div key={idx} className="bg-gray-800 rounded-lg p-3 border border-gray-700 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 font-mono">#{idx + 1}</span>
                                                <input
                                                    required
                                                    placeholder="Sub-task title"
                                                    value={sub.title}
                                                    onChange={e => updateSubTask(idx, 'title', e.target.value)}
                                                    className="flex-1 bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
                                                />
                                                <button type="button" onClick={() => removeSubTask(idx)}
                                                    className="text-gray-500 hover:text-red-400 transition"><X size={14} /></button>
                                            </div>
                                            <input
                                                placeholder="Description (optional)"
                                                value={sub.description}
                                                onChange={e => updateSubTask(idx, 'description', e.target.value)}
                                                className="w-full bg-gray-900 text-white text-xs px-2 py-1.5 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <TaskLocationPicker
                                        value={{
                                            location: form.location || null,
                                            location_text: form.location_text || null,
                                            location_lat: form.location_lat ? Number(form.location_lat) : null,
                                            location_lng: form.location_lng ? Number(form.location_lng) : null,
                                            place_id: form.place_id || null,
                                            place_name: form.place_name || null,
                                            place_address: form.place_address || null,
                                        }}
                                        onChange={(loc) =>
                                            setForm({
                                                ...form,
                                                location: loc.location || '',
                                                location_text: loc.location_text || '',
                                                location_lat: loc.location_lat != null ? String(loc.location_lat) : '',
                                                location_lng: loc.location_lng != null ? String(loc.location_lng) : '',
                                                place_id: loc.place_id || '',
                                                place_name: loc.place_name || '',
                                                place_address: loc.place_address || '',
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Due Date</label>
                                    <input type="datetime-local" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={close} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                                <button type="submit" disabled={isPending}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 transition">
                                    {isPending && <Loader2 size={14} className="animate-spin" />}
                                    {editing ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Rejection Modal ────────────────────────── */}
            {approvalModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setApprovalModal(null)}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <XCircle size={32} className="text-red-400 mx-auto mb-3" />
                        <h3 className="text-lg font-bold mb-1 text-center">Reject Completion</h3>
                        <p className="text-gray-400 text-sm mb-4 text-center">
                            Rejecting "{approvalModal.title}". The worker will need to redo the work.
                        </p>
                        <textarea
                            required
                            placeholder="Reason for rejection (required)"
                            value={rejectionNotes}
                            onChange={e => setRejectionNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-red-500 focus:outline-none resize-none mb-4"
                        />
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setApprovalModal(null)} className="px-5 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition">Cancel</button>
                            <button
                                onClick={() => rejectionNotes.trim() && rejectMut.mutate({ id: approvalModal.id, notes: rejectionNotes })}
                                disabled={!rejectionNotes.trim() || rejectMut.isPending}
                                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 transition">
                                {rejectMut.isPending && <Loader2 size={14} className="animate-spin" />} Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Photo Viewer Modal ─────────────────────── */}
            {photoViewTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPhotoViewTask(null)}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Image size={18} className="text-purple-400" /> Completion Photos — {photoViewTask.title}
                            </h3>
                            <button onClick={() => setPhotoViewTask(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-3">
                            {(photoViewTask.completion_photos || []).map(p => (
                                <a key={p.id} href={p.photo_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 transition">
                                    <img src={p.photo_url} alt="Completion photo" className="w-full h-48 object-cover" />
                                </a>
                            ))}
                            {(!photoViewTask.completion_photos || photoViewTask.completion_photos.length === 0) && (
                                <p className="col-span-2 text-center text-gray-500 py-8">No photos uploaded</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm ────────────────────────── */}
            {deleteConfirm !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                        <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
                        <h3 className="text-lg font-bold mb-1">Delete Task?</h3>
                        <p className="text-gray-400 text-sm mb-5">This will permanently remove the task and its time logs.</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setDeleteConfirm(null)} className="px-5 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition">Cancel</button>
                            <button onClick={() => deleteMut.mutate(deleteConfirm)} disabled={deleteMut.isPending}
                                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 transition">
                                {deleteMut.isPending && <Loader2 size={14} className="animate-spin" />} Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}