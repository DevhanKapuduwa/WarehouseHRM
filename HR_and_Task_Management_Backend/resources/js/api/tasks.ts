import api from './axios';
import { Task, MyTasksResponse } from '../types';

export const taskApi = {
    getAll: (filters?: { status?: string; worker_id?: number }) =>
        api.get<Task[]>('/tasks', { params: filters }).then(r => r.data),

    create: (data: {
        title: string;
        description?: string | null;
        worker_id: number;
        priority: string;
        has_subtasks?: boolean;
        parent_id?: number | null;
        subtasks?: Array<{ title: string; description?: string | null }>;
        location?: string | null;
        location_text?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
        place_id?: string | null;
        place_name?: string | null;
        place_address?: string | null;
        due_date?: string | null;
    }) => api.post<Task>('/tasks', data).then(r => r.data),

    update: (id: number, data: Partial<Task> & {
        subtasks?: Array<{ id?: number; title: string; description?: string | null }>;
    }) =>
        api.put<Task>(`/tasks/${id}`, data).then(r => r.data),

    updateStatus: (id: number, status: Task['status']) =>
        api.patch(`/tasks/${id}/status`, { status }).then(r => r.data),

    approveCompletion: (id: number, notes?: string) =>
        api.patch(`/tasks/${id}/approve-completion`, { notes }).then(r => r.data),

    rejectCompletion: (id: number, notes: string) =>
        api.patch(`/tasks/${id}/reject-completion`, { notes }).then(r => r.data),

    delete: (id: number) =>
        api.delete(`/tasks/${id}`).then(r => r.data),

    // Worker facing
    myTasks: () =>
        api.get<MyTasksResponse>('/worker/my-tasks').then(r => r.data),

    /** Omit coords when the parent task is already in progress (sub-task attend without a second GPS check). */
    start: (id: number, coords: { lat?: number; lng?: number } = {}) =>
        api.patch(`/worker/tasks/${id}/start`, coords).then(r => r.data),

    complete: (id: number) =>
        api.patch(`/worker/tasks/${id}/complete`).then(r => r.data),

    submitCompletion: (id: number, photos: File[]) => {
        const formData = new FormData();
        photos.forEach((photo) => {
            formData.append('photos[]', photo);
        });
        return api.post(`/worker/tasks/${id}/submit-completion`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data);
    },

    completeSubtask: (id: number, photos: File[]) => {
        const formData = new FormData();
        photos.forEach((photo) => {
            formData.append('photos[]', photo);
        });
        return api.post(`/worker/tasks/${id}/complete-subtask`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data);
    },
};