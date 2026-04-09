import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { engagementApi } from '../../api/engagement';
import { workerApi } from '../../api/workers';
import type { EngagementEvent, EngagementAttendance, User } from '../../types';
import { Calendar, Loader2, Plus, Trash2, Users, CheckCircle2, X, Pencil } from 'lucide-react';

type AttendanceStatus = 'present' | 'absent';

const emptyEventForm = {
    title: '',
    description: '',
    starts_at: '',
    ends_at: '',
    location_text: '',
};

export default function Engagement() {
    const qc = useQueryClient();
    const [showEventModal, setShowEventModal] = useState(false);
    const [editing, setEditing] = useState<EngagementEvent | null>(null);
    const [eventForm, setEventForm] = useState(emptyEventForm);
    const [eventError, setEventError] = useState('');

    const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
    const [attendanceDraft, setAttendanceDraft] = useState<Record<number, { status: AttendanceStatus; note: string }>>({});
    const [attendanceError, setAttendanceError] = useState('');

    const { data: events = [], isLoading: eventsLoading } = useQuery({
        queryKey: ['engagement-events'],
        queryFn: () => engagementApi.listEvents(),
    });

    const { data: workers = [] } = useQuery<User[]>({
        queryKey: ['workers'],
        queryFn: workerApi.getAll,
    });

    const { data: eventDetail, isLoading: eventLoading } = useQuery({
        queryKey: ['engagement-event', selectedEventId],
        queryFn: () => engagementApi.getEvent(selectedEventId as number),
        enabled: selectedEventId != null,
    });

    const openCreate = () => {
        setEditing(null);
        setEventForm(emptyEventForm);
        setEventError('');
        setShowEventModal(true);
    };

    const openEdit = (e: EngagementEvent) => {
        setEditing(e);
        setEventForm({
            title: e.title,
            description: e.description ?? '',
            starts_at: e.starts_at ? e.starts_at.slice(0, 16) : '',
            ends_at: e.ends_at ? e.ends_at.slice(0, 16) : '',
            location_text: e.location_text ?? '',
        });
        setEventError('');
        setShowEventModal(true);
    };

    const closeEventModal = () => {
        setShowEventModal(false);
        setEditing(null);
        setEventForm(emptyEventForm);
        setEventError('');
    };

    const createMut = useMutation({
        mutationFn: () => engagementApi.createEvent({
            title: eventForm.title,
            description: eventForm.description || null,
            starts_at: eventForm.starts_at,
            ends_at: eventForm.ends_at || null,
            location_text: eventForm.location_text || null,
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['engagement-events'] }); closeEventModal(); },
        onError: (e: any) => setEventError(e.response?.data?.message || 'Failed to create event'),
    });

    const updateMut = useMutation({
        mutationFn: () => engagementApi.updateEvent(editing!.id, {
            title: eventForm.title,
            description: eventForm.description || null,
            starts_at: eventForm.starts_at,
            ends_at: eventForm.ends_at || null,
            location_text: eventForm.location_text || null,
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['engagement-events'] }); qc.invalidateQueries({ queryKey: ['engagement-event'] }); closeEventModal(); },
        onError: (e: any) => setEventError(e.response?.data?.message || 'Failed to update event'),
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => engagementApi.deleteEvent(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['engagement-events'] });
            if (selectedEventId) setSelectedEventId(null);
        },
    });

    const saveAttendanceMut = useMutation({
        mutationFn: (id: number) => engagementApi.upsertAttendance(
            id,
            Object.entries(attendanceDraft).map(([userId, v]) => ({
                user_id: Number(userId),
                status: v.status,
                note: v.note || null,
            })),
        ),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['engagement-event', selectedEventId] });
            setAttendanceError('');
        },
        onError: (e: any) => setAttendanceError(e.response?.data?.message || 'Failed to save attendance'),
    });

    const selectedAttendances = useMemo(() => {
        const list = (eventDetail?.event?.attendances ?? []) as EngagementAttendance[];
        const byUser: Record<number, EngagementAttendance> = {};
        for (const a of list) byUser[a.user_id] = a;
        return byUser;
    }, [eventDetail]);

    const fmt = (d: string) =>
        new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const summary = useMemo(() => {
        const totalEvents = events.length;
        const totalPresent = events.reduce((s, e) => s + (e.present_count ?? 0), 0);
        const totalMarked = events.reduce((s, e) => s + ((e.present_count ?? 0) + (e.absent_count ?? 0)), 0);
        const attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0;
        return { totalEvents, totalPresent, totalMarked, attendanceRate };
    }, [events]);

    const presentCount = (eventDetail?.attendance?.present ?? 0);
    const absentCount = (eventDetail?.attendance?.absent ?? 0);
    const totalMarked = (eventDetail?.attendance?.total_marked ?? 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Users size={22} className="text-blue-400" /> Engagement & Events
                </h1>
                <button
                    onClick={openCreate}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition"
                >
                    <Plus size={16} /> New Event
                </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Events list */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white">Events</div>
                        <div className="text-xs text-gray-500">{events.length} total</div>
                    </div>
                    <div className="px-5 py-4 border-b border-gray-800 grid grid-cols-3 gap-3">
                        <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-3">
                            <div className="text-xs text-gray-500">Events</div>
                            <div className="text-lg font-bold text-white">{summary.totalEvents}</div>
                        </div>
                        <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-3">
                            <div className="text-xs text-gray-500">Marked</div>
                            <div className="text-lg font-bold text-white">{summary.totalMarked}</div>
                        </div>
                        <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-3">
                            <div className="text-xs text-gray-500">Attendance</div>
                            <div className="text-lg font-bold text-white">{summary.attendanceRate}%</div>
                        </div>
                    </div>
                    {eventsLoading ? (
                        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
                    ) : events.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">No events yet</div>
                    ) : (
                        <div className="divide-y divide-gray-800">
                            {events.map(e => (
                                <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedEventId(e.id);
                                        setAttendanceDraft({});
                                        setAttendanceError('');
                                    }}
                                    className={`w-full text-left px-5 py-4 hover:bg-gray-800/60 transition ${
                                        selectedEventId === e.id ? 'bg-gray-800/60' : ''
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-white truncate">{e.title}</div>
                                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                                                <span className="inline-flex items-center gap-1"><Calendar size={12} /> {fmt(e.starts_at)}</span>
                                                {e.location_text && <span className="text-gray-600">·</span>}
                                                {e.location_text && <span className="truncate">{e.location_text}</span>}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full bg-green-900/30 text-green-300 border border-green-800/40">
                                                    Present {e.present_count ?? 0}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-full bg-red-900/20 text-red-300 border border-red-800/30">
                                                    Absent {e.absent_count ?? 0}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(ev) => { ev.stopPropagation(); deleteMut.mutate(e.id); }}
                                                className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Attendance marking */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white">Attendance</div>
                        {selectedEventId && (
                            <button
                                type="button"
                                onClick={() => saveAttendanceMut.mutate(selectedEventId)}
                                disabled={saveAttendanceMut.isPending || Object.keys(attendanceDraft).length === 0}
                                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2 transition"
                            >
                                {saveAttendanceMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Save attendance
                            </button>
                        )}
                    </div>

                    {!selectedEventId ? (
                        <div className="text-center py-16 text-gray-500">Select an event to mark attendance</div>
                    ) : eventLoading ? (
                        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
                    ) : !eventDetail ? (
                        <div className="text-center py-16 text-gray-500">Failed to load event</div>
                    ) : (
                        <div className="p-5 space-y-4">
                            <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-4">
                                <div className="font-semibold text-white">{eventDetail.event.title}</div>
                                <div className="text-xs text-gray-500 mt-1">{fmt(eventDetail.event.starts_at)}</div>
                                <div className="text-xs text-gray-400 mt-3 flex gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-full bg-green-900/30 text-green-300 border border-green-800/40">
                                        Present {presentCount}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-red-900/20 text-red-300 border border-red-800/30">
                                        Absent {absentCount}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-gray-900 text-gray-300 border border-gray-700">
                                        Marked {totalMarked}/{workers.filter(w => w.role === 'worker' && w.is_active).length}
                                    </span>
                                </div>
                            </div>

                            {attendanceError && (
                                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                                    {attendanceError}
                                </div>
                            )}

                            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                                {workers
                                    .filter(w => w.role === 'worker' && w.is_active)
                                    .map(w => {
                                        const saved = selectedAttendances[w.id];
                                        const draft = attendanceDraft[w.id];
                                        const status: AttendanceStatus | '' = draft?.status ?? (saved?.status as AttendanceStatus | undefined) ?? '';
                                        const note = draft?.note ?? saved?.note ?? '';

                                        return (
                                            <div key={w.id} className="bg-gray-950/40 border border-gray-800 rounded-xl p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-white truncate">{w.name}</div>
                                                        <div className="text-xs text-gray-500 mt-0.5">
                                                            {w.employee_id} {w.department ? `· ${w.department}` : ''}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 flex-shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setAttendanceDraft(prev => ({
                                                                ...prev,
                                                                [w.id]: { status: 'present', note },
                                                            }))}
                                                            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                                                                status === 'present'
                                                                    ? 'bg-green-600 text-white border-green-500'
                                                                    : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-600'
                                                            }`}
                                                        >
                                                            Present
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAttendanceDraft(prev => ({
                                                                ...prev,
                                                                [w.id]: { status: 'absent', note },
                                                            }))}
                                                            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                                                                status === 'absent'
                                                                    ? 'bg-red-600 text-white border-red-500'
                                                                    : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-600'
                                                            }`}
                                                        >
                                                            Absent
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mt-2">
                                                    <input
                                                        value={note}
                                                        onChange={(e) => setAttendanceDraft(prev => ({
                                                            ...prev,
                                                            [w.id]: { status: (status || 'present') as AttendanceStatus, note: e.target.value },
                                                        }))}
                                                        placeholder="Optional note (e.g. arrived late)"
                                                        className="w-full bg-gray-900 text-gray-200 text-xs px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-blue-600"
                                                    />
                                                </div>
                                                {saved?.marked_at && (
                                                    <div className="text-[11px] text-gray-500 mt-1">
                                                        Marked {new Date(saved.marked_at).toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create/Edit event modal */}
            {showEventModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeEventModal}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="text-lg font-bold">{editing ? 'Edit Event' : 'New Event'}</h3>
                            <button onClick={closeEventModal} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                setEventError('');
                                if (editing) updateMut.mutate();
                                else createMut.mutate();
                            }}
                            className="p-5 space-y-4"
                        >
                            {eventError && (
                                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2.5 rounded-lg text-sm">
                                    {eventError}
                                </div>
                            )}
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Title *</label>
                                <input
                                    required
                                    value={eventForm.title}
                                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Description</label>
                                <textarea
                                    rows={3}
                                    value={eventForm.description}
                                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Starts At *</label>
                                    <input
                                        type="datetime-local"
                                        required
                                        value={eventForm.starts_at}
                                        onChange={(e) => setEventForm({ ...eventForm, starts_at: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-xs mb-1">Ends At</label>
                                    <input
                                        type="datetime-local"
                                        value={eventForm.ends_at}
                                        onChange={(e) => setEventForm({ ...eventForm, ends_at: e.target.value })}
                                        className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Location (optional)</label>
                                <input
                                    value={eventForm.location_text}
                                    onChange={(e) => setEventForm({ ...eventForm, location_text: e.target.value })}
                                    className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={closeEventModal} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                                <button
                                    type="submit"
                                    disabled={createMut.isPending || updateMut.isPending}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 transition"
                                >
                                    {(createMut.isPending || updateMut.isPending) && <Loader2 size={14} className="animate-spin" />}
                                    {editing ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

