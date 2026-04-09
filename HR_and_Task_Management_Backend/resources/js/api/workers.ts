import { User, WorkerDashboard, ManagerProfileFields, WorkerSelfProfileFields } from '../types';
import api from './axios';

export const workerApi = {
    getAll: () =>
        api.get<User[]>('/workers').then(r => r.data),

    getById: (id: number) =>
        api.get<User>(`/workers/${id}`).then(r => r.data),

    create: (data: Partial<User> & { password: string }) =>
        api.post<User>('/workers', data).then(r => r.data),

    update: (id: number, data: Partial<User> & { password?: string } & Partial<ManagerProfileFields>) =>
        api.put<User>(`/workers/${id}`, data).then(r => r.data),

    delete: (id: number) =>
        api.delete(`/workers/${id}`).then(r => r.data),

    toggleStatus: (id: number) =>
        api.patch(`/workers/${id}/toggle-status`).then(r => r.data),

    getEmotionDetails: (id: number) =>
        api.get(`/workers/${id}/emotion-details`).then(r => r.data),

    // Churn prediction
    getChurnAll: () =>
        api.get('/workers/churn').then(r => r.data),

    getChurnById: (id: number) =>
        api.get(`/workers/${id}/churn`).then(r => r.data),

    // Worker self-service
    dashboard: () =>
        api.get<WorkerDashboard>('/worker/dashboard').then(r => r.data),

    myShift: () =>
        api.get('/worker/my-shift').then(r => r.data),

    myProfile: () =>
        api.get<User>('/worker/profile').then(r => r.data),

    updateMyProfile: (data: Partial<WorkerSelfProfileFields>) =>
        api.patch<User>('/worker/profile', data).then(r => r.data),
};