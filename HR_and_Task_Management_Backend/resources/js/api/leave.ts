import api from './axios';
import type { LeaveBalance, LeaveRequest, LeaveType } from '../types';

export const leaveApi = {
    // Worker
    myBalances: () => api.get<LeaveBalance[]>('/worker/leave/balances').then(r => r.data),
    myRequests: () => api.get<LeaveRequest[]>('/worker/leave/requests').then(r => r.data),
    createRequest: (data: {
        leave_type_id: number;
        start_at: string;
        end_at: string;
        duration_hours: number;
        reason?: string | null;
    }) => api.post<LeaveRequest>('/worker/leave/requests', data).then(r => r.data),

    /** All leave requests (management / HR / supervisor portal) */
    allRequests: (params?: { status?: string }) =>
        api.get<LeaveRequest[]>('/leave/requests', { params }).then(r => r.data),

    // Approver inbox
    inbox: () => api.get<any[]>('/leave/inbox').then(r => r.data),
    act: (leaveRequestId: number, data: { action: 'approved' | 'rejected'; comment?: string | null }) =>
        api.post<LeaveRequest>(`/leave/requests/${leaveRequestId}/act`, data).then(r => r.data),

    // Leave types
    listTypes: () => api.get<LeaveType[]>('/leave/types').then(r => r.data),
    workerTypes: () => api.get<LeaveType[]>('/worker/leave/types').then(r => r.data),
    createType: (data: Partial<LeaveType> & {
        name: string;
        code: string;
        approval_chain_roles: Array<'supervisor' | 'hr' | 'management'>;
        yearly_entitlement_hours: number;
    }) => api.post<LeaveType>('/leave/types', data).then(r => r.data),
    updateType: (id: number, data: Partial<LeaveType>) => api.put<LeaveType>(`/leave/types/${id}`, data).then(r => r.data),
    deleteType: (id: number) => api.delete(`/leave/types/${id}`).then(r => r.data),
};

