import { User } from '../types';
import api from './axios';

export interface AuthResponse {
    token: string;
    user: User;
    role: 'management' | 'worker';
}

export const authApi = {
    login: (email: string, password: string) =>
        api.post<AuthResponse>('/login', { email, password }).then(r => r.data),

    logout: () =>
        api.post('/logout').then(r => r.data),

    me: () =>
        api.get<User>('/me').then(r => r.data),
};