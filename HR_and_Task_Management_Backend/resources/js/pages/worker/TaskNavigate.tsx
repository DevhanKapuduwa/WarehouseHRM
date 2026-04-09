import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleMap, DirectionsRenderer, DirectionsService, useJsApiLoader, Marker } from '@react-google-maps/api';
import { taskApi } from '../../api/tasks';
import { Task } from '../../types';
import { Loader2, ArrowLeft, MapPin } from 'lucide-react';

export default function TaskNavigate() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [task, setTask] = useState<Task | null>(null);
    const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
    const [origin, setOrigin] = useState<google.maps.LatLngLiteral | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
        libraries: ['places'],
    });

    useEffect(() => {
        const fetchTask = async () => {
            try {
                const response = await taskApi.myTasks();
                const found = response.tasks.find(t => t.id === Number(id));
                if (!found) {
                    setError('Task not found.');
                } else if (found.location_lat == null || found.location_lng == null) {
                    setError('This task has no map location assigned by management.');
                } else {
                    setTask(found);
                }
            } catch {
                setError('Failed to load task.');
            }
        };
        fetchTask();
    }, [id]);

    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => {
                // Silent fail, user can still see destination marker
            },
        );
    }, []);

    const destination = useMemo(() => {
        if (!task || task.location_lat == null || task.location_lng == null) return null;
        return { lat: task.location_lat, lng: task.location_lng };
    }, [task]);

    const center = destination ?? origin ?? { lat: 6.9271, lng: 79.8612 };

    if (loadError) {
        return <div className="text-red-400 text-sm">Failed to load map.</div>;
    }

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="animate-spin mr-2" /> Loading map...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
            >
                <ArrowLeft size={16} /> Back to tasks
            </button>

            <h1 className="text-2xl font-bold flex items-center gap-2">
                <MapPin size={22} className="text-green-400" />
                Navigate to task
            </h1>

            {error && (
                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {task && (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-sm text-gray-300 space-y-1">
                    <div className="font-semibold text-white">{task.title}</div>
                    {task.place_name && <div>{task.place_name}</div>}
                    {task.place_address && <div className="text-gray-400 text-xs">{task.place_address}</div>}
                    {!task.place_name && !task.place_address && task.location && (
                        <div className="text-gray-400 text-xs">{task.location}</div>
                    )}
                </div>
            )}

            <div className="h-[380px] rounded-xl overflow-hidden border border-gray-800">
                {destination && (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={center}
                        zoom={14}
                        options={{
                            disableDefaultUI: false,
                            streetViewControl: false,
                            mapTypeControl: false,
                        }}
                    >
                        {origin && !directions && (
                            <DirectionsService
                                options={{
                                    origin,
                                    destination,
                                    travelMode: google.maps.TravelMode.DRIVING,
                                }}
                                callback={(res, status) => {
                                    if (status === google.maps.DirectionsStatus.OK && res) {
                                        setDirections(res);
                                    }
                                }}
                            />
                        )}

                        {directions ? (
                            <DirectionsRenderer directions={directions} />
                        ) : (
                            <>
                                {origin && <Marker position={origin} label="You" />}
                                <Marker position={destination} />
                            </>
                        )}
                    </GoogleMap>
                )}
            </div>
        </div>
    );
}

