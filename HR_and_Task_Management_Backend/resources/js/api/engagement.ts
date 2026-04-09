import api from './axios';
import type { EngagementEvent, EngagementEventDetailResponse } from '../types';

export const engagementApi = {
    listEvents: (filters?: { from?: string; to?: string }) =>
        api.get<EngagementEvent[]>('/engagement/events', { params: filters }).then(r => r.data),

    createEvent: (data: {
        title: string;
        description?: string | null;
        starts_at: string;
        ends_at?: string | null;
        location_text?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
    }) => api.post<EngagementEvent>('/engagement/events', data).then(r => r.data),

    updateEvent: (id: number, data: Partial<Pick<EngagementEvent,
        'title' | 'description' | 'starts_at' | 'ends_at' | 'location_text' | 'location_lat' | 'location_lng'
    >>) => api.put<EngagementEvent>(`/engagement/events/${id}`, data).then(r => r.data),

    deleteEvent: (id: number) =>
        api.delete(`/engagement/events/${id}`).then(r => r.data),

    getEvent: (id: number) =>
        api.get<EngagementEventDetailResponse>(`/engagement/events/${id}`).then(r => r.data),

    upsertAttendance: (id: number, items: Array<{ user_id: number; status: 'present' | 'absent'; note?: string | null }>) =>
        api.put<EngagementEventDetailResponse>(`/engagement/events/${id}/attendance`, { items }).then(r => r.data),
};

