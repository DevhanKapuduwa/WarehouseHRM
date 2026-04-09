import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { faceRecognitionApi } from '../../api/faceRecognition';
import { Camera, Loader2, PlayCircle, RefreshCw, VideoOff } from 'lucide-react';

const fmtDateTime = (value: string) =>
    new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

// The Laravel proxy URL — goes directly to Laravel (port 8000) to avoid Vite proxy buffering MJPEG
const LARAVEL_BASE = 'http://127.0.0.1:8000';
const PROXY_STREAM_URL = `${LARAVEL_BASE}/api/face/live-stream/proxy`;

// Base URL for the API (Vite dev server proxies /api → Laravel)
const getStreamSrc = (cacheKey: number) =>
    `${PROXY_STREAM_URL}?_cb=${cacheKey}`;

export default function FaceRecognition() {
    const qc = useQueryClient();
    const [dateFilter, setDateFilter] = useState('');
    const [streamImgError, setStreamImgError] = useState(false);
    const [streamKey, setStreamKey] = useState(0);
    const [waitingForStream, setWaitingForStream] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { data: groupedData, isLoading, isError: logsError } = useQuery({
        queryKey: ['face-management-logs', dateFilter],
        queryFn: () => faceRecognitionApi.managementLogs(dateFilter ? { date: dateFilter } : undefined),
    });

    const { data: liveStatus, isFetching: liveStatusLoading } = useQuery({
        queryKey: ['face-live-status'],
        queryFn: faceRecognitionApi.liveStatus,
        refetchInterval: waitingForStream ? 3000 : 12000,
    });

    // When stream becomes running, stop the "waiting" state and reload the img
    useEffect(() => {
        if (liveStatus?.running && waitingForStream) {
            setWaitingForStream(false);
            setStreamImgError(false);
            setStreamKey(k => k + 1);
        }
    }, [liveStatus?.running, waitingForStream]);

    // Clear polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const startStream = useMutation({
        mutationFn: faceRecognitionApi.startLiveStream,
        onSuccess: (data) => {
            setStreamImgError(false);
            // If the stream is already running (returned from server), reload immediately
            if (liveStatus?.running) {
                setStreamKey(k => k + 1);
            } else {
                // Show a waiting spinner while Step 7 boots up (models load, camera init ~5-10s)
                setWaitingForStream(true);
            }
            qc.invalidateQueries({ queryKey: ['face-live-status'] });
        },
    });

    const handleRefreshStream = () => {
        setStreamImgError(false);
        setStreamKey(k => k + 1);
        qc.invalidateQueries({ queryKey: ['face-live-status'] });
    };

    const isStreamReady = liveStatus?.running === true && !streamImgError && !waitingForStream;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Camera size={24} className="text-blue-400" /> Face Recognition Logs
                </h1>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        className="bg-gray-900 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-800 focus:outline-none focus:border-blue-500"
                    />
                    {dateFilter && (
                        <button className="text-xs text-gray-400 hover:text-white" onClick={() => setDateFilter('')}>
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Live Stream Panel */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 sm:p-5 space-y-3">
                {/* Title + controls */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                        Live Stream
                        {liveStatus?.running && (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-900/50 text-green-400 border border-green-700/50 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                LIVE
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefreshStream}
                            className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded-md text-gray-200 flex items-center gap-1 transition-colors"
                            title="Refresh stream"
                        >
                            <RefreshCw size={14} className={liveStatusLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <button
                            onClick={() => startStream.mutate()}
                            disabled={startStream.isPending || waitingForStream}
                            className="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md text-white flex items-center gap-1 transition-colors"
                        >
                            {startStream.isPending || waitingForStream
                                ? <Loader2 size={14} className="animate-spin" />
                                : <PlayCircle size={14} />}
                            {waitingForStream ? 'Starting…' : 'Start Live Stream'}
                        </button>
                    </div>
                </div>

                {/* Status row */}
                <div className="text-sm text-gray-300 flex items-center gap-3 flex-wrap">
                    <span>
                        Status:{' '}
                        <span className={liveStatus?.running ? 'text-green-400 font-semibold' : 'text-yellow-400 font-semibold'}>
                            {waitingForStream ? 'Starting up…' : liveStatus?.running ? 'Running' : 'Not Running'}
                        </span>
                        {liveStatus?.pid ? <span className="text-gray-500 ml-1">· PID {liveStatus.pid}</span> : null}
                    </span>
                </div>

                {/* Stream viewport */}
                <div className="bg-black rounded-lg overflow-hidden border border-gray-800 min-h-[240px] flex items-center justify-center relative">
                    {waitingForStream ? (
                        /* Waiting for Step 7 to boot */
                        <div className="flex flex-col items-center gap-3 text-gray-400 py-12">
                            <Loader2 size={36} className="animate-spin text-blue-400" />
                            <p className="text-sm">Starting Step 7… loading models & camera</p>
                            <p className="text-xs text-gray-600">This usually takes 10–30 seconds</p>
                        </div>
                    ) : streamImgError ? (
                        /* Stream failed to load */
                        <div className="flex flex-col items-center gap-3 text-yellow-300 py-12">
                            <VideoOff size={36} className="text-yellow-500" />
                            <p className="text-sm font-medium">Stream not available</p>
                            <p className="text-xs text-gray-500 text-center max-w-xs">
                                Step 7 may still be loading. Click <strong>Refresh</strong> in ~10s, or
                                press <strong>Start Live Stream</strong> to launch it.
                            </p>
                        </div>
                    ) : liveStatus?.running ? (
                        /* MJPEG img — loaded via Laravel proxy to avoid CORS */
                        <img
                            key={streamKey}
                            src={getStreamSrc(streamKey)}
                            alt="Step 7 live stream"
                            className="w-full max-h-[480px] object-contain"
                            onError={() => setStreamImgError(true)}
                            onLoad={() => setStreamImgError(false)}
                        />
                    ) : (
                        /* Not running yet */
                        <div className="flex flex-col items-center gap-3 text-gray-600 py-12">
                            <Camera size={36} />
                            <p className="text-sm">Press <strong className="text-gray-400">Start Live Stream</strong> to begin</p>
                        </div>
                    )}
                </div>

                {/* Step 7 properties grid */}
                {liveStatus?.step7_properties && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                        <div className="bg-gray-800/70 px-3 py-2 rounded">Resolution: {liveStatus.step7_properties.resolution}</div>
                        <div className="bg-gray-800/70 px-3 py-2 rounded">FPS: {liveStatus.step7_properties.fps}</div>
                        <div className="bg-gray-800/70 px-3 py-2 rounded">YOLO: {liveStatus.step7_properties.yolo_model}</div>
                        <div className="bg-gray-800/70 px-3 py-2 rounded">Confidence: {liveStatus.step7_properties.yolo_confidence}</div>
                        <div className="bg-gray-800/70 px-3 py-2 rounded">Cooldown: {liveStatus.step7_properties.cooldown_seconds}s</div>
                        <div className="bg-gray-800/70 px-3 py-2 rounded">Camera: {liveStatus.step7_properties.camera_source}</div>
                    </div>
                )}
            </div>

            {/* Detection Logs */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-blue-400" />
                </div>
            ) : logsError ? (
                <div className="text-center py-12 text-red-400">
                    Failed to load face detection logs from backend.
                </div>
            ) : groupedData?.groups?.length ? (
                <div className="space-y-4">
                    {groupedData.groups.map(group => (
                        <div key={group.worker.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-800">
                                <p className="font-semibold">{group.worker.name}</p>
                                <p className="text-xs text-gray-500">{group.worker.employee_id} · {group.logs.length} detections</p>
                            </div>
                            <div className="max-h-72 overflow-y-auto divide-y divide-gray-800">
                                {group.logs.map((log, idx) => (
                                    <div key={`${group.worker.id}-${idx}`} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                                        <span className="text-gray-200">{fmtDateTime(log.timestamp)}</span>
                                        <span className="text-gray-400">sim {log.similarity.toFixed(4)} · {log.camera}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-gray-500">No face detections found for selected filters.</div>
            )}
        </div>
    );
}
