import api from './axios';
import type {
    FaceDetectionLogGroup,
    FaceDetectionLog,
    FaceLiveStreamStatus,
} from '../types';

export const faceRecognitionApi = {
    managementLogs: (filters?: { date?: string }) =>
        api.get<{ groups: FaceDetectionLogGroup[]; unknown_logs: FaceDetectionLog[] }>('/face/logs', { params: filters }).then(r => r.data),

    workerLogs: (filters?: { date?: string }) =>
        api.get<{ worker: { id: number; name: string; employee_id: string }; logs: FaceDetectionLog[] }>('/worker/face-logs', { params: filters }).then(r => r.data),

    liveStatus: () =>
        api.get<FaceLiveStreamStatus>('/face/live-stream/status').then(r => r.data),

    startLiveStream: () =>
        api.post<{ message: string; pid?: number; stream_url?: string }>('/face/live-stream/start').then(r => r.data),
};
