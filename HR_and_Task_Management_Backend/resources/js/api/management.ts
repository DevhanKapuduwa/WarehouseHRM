import { DashboardStats } from '../types';
import api from './axios';

export const managementApi = {
    stats: () =>
        api.get<DashboardStats>('/dashboard/stats').then(r => r.data),
};