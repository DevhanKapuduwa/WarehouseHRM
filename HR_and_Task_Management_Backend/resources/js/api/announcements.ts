import { Announcement } from '../types';
import api from './axios';

export const announcementApi = {
    getAll: () =>
        api.get<Announcement[]>('/announcements').then(r => r.data),

    create: (data: {
        title: string;
        body: string;
        target: 'all' | 'workers' | 'management';
    }) => api.post<Announcement>('/announcements', data).then(r => r.data),

    delete: (id: number) =>
        api.delete(`/announcements/${id}`).then(r => r.data),
};
