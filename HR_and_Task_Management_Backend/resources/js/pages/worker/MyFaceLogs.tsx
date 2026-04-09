import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { faceRecognitionApi } from '../../api/faceRecognition';
import { Camera, Loader2 } from 'lucide-react';

const fmtDateTime = (value: string) =>
    new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

export default function MyFaceLogs() {
    const [dateFilter, setDateFilter] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['worker-face-logs', dateFilter],
        queryFn: () => faceRecognitionApi.workerLogs(dateFilter ? { date: dateFilter } : undefined),
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Camera size={24} className="text-green-400" /> My Face Detection Logs
                </h1>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        className="bg-gray-900 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-green-500"
                    />
                    {dateFilter && (
                        <button className="text-xs text-gray-400 hover:text-white" onClick={() => setDateFilter('')}>
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="font-semibold">
                        {data?.worker?.name ?? 'My'} detections {data?.worker?.employee_id ? `(${data.worker.employee_id})` : ''}
                    </h2>
                </div>
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="animate-spin text-green-400" />
                    </div>
                ) : data?.logs?.length ? (
                    <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-800">
                        {data.logs.map((log, idx) => (
                            <div key={`${log.timestamp}-${idx}`} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                                <span className="text-gray-200">{fmtDateTime(log.timestamp)}</span>
                                <span className="text-gray-400">sim {log.similarity.toFixed(4)} · {log.camera}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center text-gray-500">No face detections for selected filters.</div>
                )}
            </div>
        </div>
    );
}
