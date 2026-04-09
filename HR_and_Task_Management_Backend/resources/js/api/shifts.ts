import { Shift } from '../types';
import api from './axios';

export const shiftApi = {
    getAll: () =>
        api.get<Shift[]>('/shifts').then(r => r.data),

    create: (data: {
        user_id: number;
        shift_name: string;
        start_time: string;
        end_time: string;
        date: string;
    }) => api.post<Shift>('/shifts', data).then(r => r.data),

    delete: (id: number) =>
        api.delete(`/shifts/${id}`).then(r => r.data),
};
