import api from './axios';

export const timeLogApi = {
    getAll: (filters?: { worker_id?: number; date?: string }) =>
        api.get('/time-logs', { params: filters }).then(r => r.data),

    clockIn: (task_id?: number) =>
        api.post('/worker/clock-in', { task_id }).then(r => r.data),

    clockOut: () =>
        api.post('/worker/clock-out').then(r => r.data),

    myHours: () =>
        api.get('/worker/my-hours').then(r => r.data),
};