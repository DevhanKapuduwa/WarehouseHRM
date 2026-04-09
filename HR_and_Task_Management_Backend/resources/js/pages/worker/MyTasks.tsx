import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../../api/tasks';
import { Task, MyTasksResponse } from '../../types';
import {
    ClipboardList, Loader2, Play, CheckCircle2, MapPin, Calendar, User,
    Camera, Upload, X, AlertCircle, GitBranch, ChevronDown, ChevronRight,
    Clock, Image
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
const tabs = ['all', 'pending', 'in_progress', 'pending_approval', 'completed'] as const;

export default function MyTasks() {
    const qc = useQueryClient();
    const [filter, setFilter] = useState<string>('all');
    const navigate = useNavigate();
    const [geoError, setGeoError] = useState<string>('');
    const [submitModal, setSubmitModal] = useState<Task | null>(null);
    const [submitMode, setSubmitMode] = useState<'approval' | 'subtask_complete'>('approval');
    const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

    const { data: myTasksData, isLoading } = useQuery<MyTasksResponse>({
        queryKey: ['my-tasks'],
        queryFn: taskApi.myTasks,
    });

    const tasks = myTasksData?.tasks || [];

    const startMut = useMutation({
        mutationFn: ({ id, lat, lng }: { id: number; lat?: number; lng?: number }) =>
            lat !== undefined && lng !== undefined ? taskApi.start(id, { lat, lng }) : taskApi.start(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
            qc.invalidateQueries({ queryKey: ['worker-dashboard'] });
            qc.invalidateQueries({ queryKey: ['my-hours'] });
        },
        onError: (e: any) => setGeoError(e.response?.data?.message || 'Unable to start task.'),
    });

    const submitMut = useMutation({
        mutationFn: ({ id, photos }: { id: number; photos: File[] }) => taskApi.submitCompletion(id, photos),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
            qc.invalidateQueries({ queryKey: ['worker-dashboard'] });
            closeSubmitModal();
        },
        onError: (e: any) => setGeoError(e.response?.data?.message || 'Failed to submit.'),
    });

    const completeSubtaskMut = useMutation({
        mutationFn: ({ id, photos }: { id: number; photos: File[] }) => taskApi.completeSubtask(id, photos),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
            qc.invalidateQueries({ queryKey: ['worker-dashboard'] });
            closeSubmitModal();
        },
        onError: (e: any) => setGeoError(e.response?.data?.message || 'Failed to complete sub-task.'),
    });

    const filtered = filter === 'all' ? tasks : tasks.filter(t => {
        if (t.status === filter) return true;
        // Also show parent tasks that have sub-tasks with matching status
        if (t.has_subtasks && t.subtasks?.some(s => s.status === filter)) return true;
        return false;
    });

    const fmtDate = (d: string | null) => {
        if (!d) return null;
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const openSubmitModal = (task: Task) => {
        setSubmitModal(task);
        setSubmitMode(task.parent_id ? 'subtask_complete' : 'approval');
        setSelectedPhotos([]);
        setPhotoPreviews([]);
        setGeoError('');
    };

    const closeSubmitModal = () => {
        setSubmitModal(null);
        setSubmitMode('approval');
        setSelectedPhotos([]);
        setPhotoPreviews([]);
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newPhotos = [...selectedPhotos, ...files];
        setSelectedPhotos(newPhotos);

        // Create previews
        const newPreviews = [...photoPreviews];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                newPreviews.push(reader.result as string);
                setPhotoPreviews([...newPreviews]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removePhoto = (idx: number) => {
        setSelectedPhotos(prev => prev.filter((_, i) => i !== idx));
        setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmitForApproval = () => {
        if (!submitModal) return;
        if (submitMode === 'subtask_complete') {
            completeSubtaskMut.mutate({ id: submitModal.id, photos: selectedPhotos });
            return;
        }
        submitMut.mutate({ id: submitModal.id, photos: selectedPhotos });
    };

    const toggleExpand = (id: number) => {
        const next = new Set(expandedTasks);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedTasks(next);
    };

    const getTaskCounts = (status: string) => {
        if (status === 'all') return tasks.length;
        return tasks.filter(t => {
            if (t.status === status) return true;
            if (t.has_subtasks && t.subtasks?.some(s => s.status === status)) return true;
            return false;
        }).length;
    };

    const canAttendSubTask = (parentTask: Task, subTask: Task) => {
        const ordered = [...(parentTask.subtasks || [])].sort((a, b) => a.id - b.id);
        const idx = ordered.findIndex(s => s.id === subTask.id);
        if (idx <= 0) return true;
        const previous = ordered[idx - 1];
        return previous.status === 'completed';
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ClipboardList size={24} className="text-green-400" /> My Tasks
                <span className="text-sm font-normal text-gray-500 ml-2">({tasks.length})</span>
            </h1>

            {geoError && (
                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {geoError}
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {tabs.map(t => (
                    <button key={t} onClick={() => setFilter(t)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === t
                                ? (t === 'pending_approval' ? 'bg-purple-600 text-white' : 'bg-green-600 text-white')
                                : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700 hover:text-white'
                            }`}>
                        {t === 'all' ? 'All' : t === 'in_progress' ? 'In Progress' : t === 'pending_approval' ? 'Awaiting Approval' : t.charAt(0).toUpperCase() + t.slice(1)}
                        <span className="ml-1.5 text-xs opacity-70">
                            ({getTaskCounts(t)})
                        </span>
                    </button>
                ))}
            </div>

            {/* Task List */}
            {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-green-400" size={28} /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                    {filter === 'all' ? 'No tasks assigned yet' : `No ${filter.replace(/_/g, ' ')} tasks`}
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(t => (
                        <div key={t.id} className={`bg-gray-900 rounded-xl border p-5 hover:border-gray-700 transition ${t.status === 'pending_approval' ? 'border-purple-700/50' : 'border-gray-800'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-3 mb-2">
                                        {t.has_subtasks && (
                                            <button onClick={() => toggleExpand(t.id)} className="text-gray-400 hover:text-white transition mt-1">
                                                {expandedTasks.has(t.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </button>
                                        )}
                                        <h3 className="font-semibold text-white">{t.title}</h3>
                                        <div className="flex gap-2 flex-shrink-0 mt-0.5">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge[t.status]}`}>{t.status.replace(/_/g, ' ')}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${priorityBadge[t.priority]}`}>{t.priority}</span>
                                            {t.has_subtasks && (
                                                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400 border border-gray-700 flex items-center gap-1">
                                                    <GitBranch size={10} /> {(t.subtasks || []).length} sub-tasks
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {t.description && <p className="text-gray-400 text-sm mb-3">{t.description}</p>}

                                    {/* Rejection feedback */}
                                    {t.approval_notes && t.status === 'in_progress' && (
                                        <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2 mb-3">
                                            <p className="text-red-400 text-xs flex items-center gap-1.5">
                                                <AlertCircle size={12} /> <strong>Rejected:</strong> {t.approval_notes}
                                            </p>
                                        </div>
                                    )}

                                    {/* Pending approval message */}
                                    {t.status === 'pending_approval' && (
                                        <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg px-3 py-2 mb-3">
                                            <p className="text-purple-400 text-xs flex items-center gap-1.5">
                                                <Clock size={12} /> Submitted for approval. Waiting for management review.
                                            </p>
                                        </div>
                                    )}

                                    {/* Completion photos preview */}
                                    {t.completion_photos && t.completion_photos.length > 0 && (
                                        <div className="flex items-center gap-2 mb-3">
                                            <Image size={12} className="text-purple-400" />
                                            <span className="text-xs text-purple-400">{t.completion_photos.length} photo(s) submitted</span>
                                            <div className="flex gap-1">
                                                {t.completion_photos.slice(0, 3).map(p => (
                                                    <img key={p.id} src={p.photo_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-700" />
                                                ))}
                                                {t.completion_photos.length > 3 && <span className="text-xs text-gray-500">+{t.completion_photos.length - 3}</span>}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                        {t.manager && <span className="flex items-center gap-1"><User size={12} /> Assigned by {t.manager.name}</span>}
                                        {t.location && <span className="flex items-center gap-1"><MapPin size={12} /> {t.location}</span>}
                                        {t.due_date && <span className="flex items-center gap-1"><Calendar size={12} /> Due {fmtDate(t.due_date)}</span>}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex-shrink-0 flex flex-col items-stretch gap-2">
                                    {t.location_lat != null && t.location_lng != null && (
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/worker/tasks/${t.id}/navigate`)}
                                            className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2 transition"
                                        >
                                            <MapPin size={14} /> Navigate
                                        </button>
                                    )}
                                    {t.status === 'pending' && (
                                        <button
                                            onClick={() => {
                                                setGeoError('');
                                                if (t.location_lat == null || t.location_lng == null) {
                                                    setGeoError('Please go to the work location to start the work.');
                                                    return;
                                                }
                                                if (!navigator.geolocation) {
                                                    setGeoError('Location is not available on this device/browser.');
                                                    return;
                                                }
                                                navigator.geolocation.getCurrentPosition(
                                                    (pos) => startMut.mutate({
                                                        id: t.id,
                                                        lat: pos.coords.latitude,
                                                        lng: pos.coords.longitude,
                                                    }),
                                                    () => setGeoError('Please enable location access to start the work.'),
                                                    { enableHighAccuracy: true, timeout: 10000 },
                                                );
                                            }}
                                            disabled={startMut.isPending}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition">
                                            {startMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start
                                        </button>
                                    )}
                                    {t.status === 'in_progress' && !t.has_subtasks && (
                                        <button onClick={() => openSubmitModal(t)}
                                            className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition">
                                            <Camera size={14} /> Submit for Approval
                                        </button>
                                    )}
                                    {t.status === 'in_progress' && t.has_subtasks && (
                                        <>
                                            {(t.subtasks || []).every(s => s.status === 'completed') ? (
                                                <button onClick={() => submitMut.mutate({ id: t.id, photos: [] })}
                                                    disabled={submitMut.isPending}
                                                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition">
                                                    {submitMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                    Complete Full Task
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-400">
                                                    Expand sub-tasks and use Attend on each in order, then submit the full task here.
                                                </span>
                                            )}
                                        </>
                                    )}
                                    {t.status === 'pending_approval' && (
                                        <span className="text-purple-400 text-sm flex items-center gap-1"><Clock size={14} /> Awaiting Approval</span>
                                    )}
                                    {t.status === 'completed' && (
                                        <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle2 size={14} /> Done</span>
                                    )}
                                </div>
                            </div>

                            {/* Sub-tasks expanded view */}
                            {t.has_subtasks && expandedTasks.has(t.id) && (t.subtasks || []).length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                                        <GitBranch size={12} /> Sub-tasks
                                    </p>
                                    {(t.subtasks || []).map(sub => (
                                        <div key={sub.id} className={`ml-4 pl-3 border-l-2 py-3 ${sub.status === 'pending_approval' ? 'border-purple-500' : sub.status === 'completed' ? 'border-green-500' : 'border-gray-700'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm text-gray-200 font-medium">{sub.title}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusBadge[sub.status]}`}>{sub.status.replace(/_/g, ' ')}</span>
                                                    </div>
                                                    {sub.description && <p className="text-gray-500 text-xs">{sub.description}</p>}
                                                    {sub.approval_notes && sub.status === 'in_progress' && (
                                                        <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={10} /> {sub.approval_notes}</p>
                                                    )}
                                                    {sub.status === 'pending_approval' && (
                                                        <p className="text-purple-400 text-xs mt-1 flex items-center gap-1"><Clock size={10} /> Awaiting approval</p>
                                                    )}
                                                    {sub.completion_photos && sub.completion_photos.length > 0 && (
                                                        <div className="flex gap-1 mt-1">
                                                            {sub.completion_photos.slice(0, 3).map(p => (
                                                                <img key={p.id} src={p.photo_url} alt="" className="w-7 h-7 rounded object-cover border border-gray-700" />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-shrink-0">
                                                    {sub.status === 'in_progress' && (
                                                        <button onClick={() => openSubmitModal(sub)}
                                                            className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
                                                            <Camera size={12} /> Complete Task
                                                        </button>
                                                    )}
                                                    {sub.status === 'pending' && (
                                                        <button
                                                            onClick={() => {
                                                                setGeoError('');
                                                                if (!canAttendSubTask(t, sub)) {
                                                                    setGeoError('Please complete previous sub-task first.');
                                                                    return;
                                                                }
                                                                // Parent already started at the job site — no second location check for sub-tasks.
                                                                if (t.status === 'in_progress') {
                                                                    startMut.mutate({ id: sub.id });
                                                                    return;
                                                                }
                                                                if (t.location_lat == null || t.location_lng == null) {
                                                                    setGeoError('Please go to the work location to start the work.');
                                                                    return;
                                                                }
                                                                if (!navigator.geolocation) {
                                                                    setGeoError('Location is not available on this device/browser.');
                                                                    return;
                                                                }
                                                                navigator.geolocation.getCurrentPosition(
                                                                    (pos) => startMut.mutate({
                                                                        id: sub.id,
                                                                        lat: pos.coords.latitude,
                                                                        lng: pos.coords.longitude,
                                                                    }),
                                                                    () => setGeoError('Please enable location access to attend sub-task.'),
                                                                    { enableHighAccuracy: true, timeout: 10000 },
                                                                );
                                                            }}
                                                            disabled={!canAttendSubTask(t, sub) || startMut.isPending}
                                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                                                        >
                                                            {startMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Attend
                                                        </button>
                                                    )}
                                                    {sub.status === 'completed' && <CheckCircle2 size={14} className="text-green-400" />}
                                                    {sub.status === 'pending_approval' && <Clock size={14} className="text-purple-400" />}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Submit for Approval Modal ──────────────── */}
            {submitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeSubmitModal}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Camera size={18} className="text-purple-400" /> Submit for Approval
                            </h3>
                            <button onClick={closeSubmitModal} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700/50">
                                <p className="text-white font-medium text-sm">{submitModal.title}</p>
                                <p className="text-gray-500 text-xs mt-1">
                                    {submitMode === 'subtask_complete'
                                        ? 'Complete this sub-task. Upload proof photos if needed.'
                                        : 'Upload photos of the completed work for management approval (optional).'}
                                </p>
                            </div>

                            {/* Photo Upload Area */}
                            <div>
                                <label className="block text-gray-400 text-xs mb-2">Completion Photos (optional)</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/jpg,image/png,image/webp"
                                    multiple
                                    onChange={handlePhotoSelect}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-xl py-6 flex flex-col items-center gap-2 transition"
                                >
                                    <Upload size={24} className="text-gray-500" />
                                    <span className="text-sm text-gray-400">Click to upload photos</span>
                                    <span className="text-xs text-gray-600">JPEG, PNG, WebP • Max 10MB each</span>
                                </button>
                            </div>

                            {/* Photo Previews */}
                            {photoPreviews.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {photoPreviews.map((preview, idx) => (
                                        <div key={idx} className="relative group">
                                            <img src={preview} alt={`Photo ${idx + 1}`}
                                                className="w-full h-24 object-cover rounded-lg border border-gray-700" />
                                            <button
                                                onClick={() => removePhoto(idx)}
                                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={closeSubmitModal}
                                    className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                                <button
                                    onClick={handleSubmitForApproval}
                                    disabled={submitMut.isPending || completeSubtaskMut.isPending}
                                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 transition"
                                >
                                    {(submitMut.isPending || completeSubtaskMut.isPending) ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    {submitMode === 'subtask_complete' ? 'Complete Task' : 'Submit for Approval'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}