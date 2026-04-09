import { useCallback, useMemo, useState } from 'react';
import { GoogleMap, Marker, useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import { MapPin, Loader2, X } from 'lucide-react';

type LocationValue = {
    location?: string | null;
    location_text?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    place_id?: string | null;
    place_name?: string | null;
    place_address?: string | null;
};

interface TaskLocationPickerProps {
    value: LocationValue;
    onChange: (value: LocationValue) => void;
}

const containerStyle: google.maps.MapOptions['center'] = { lat: 6.9271, lng: 79.8612 };

export function TaskLocationPicker({ value, onChange }: TaskLocationPickerProps) {
    const [searchBox, setSearchBox] = useState<google.maps.places.Autocomplete | null>(null);

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
        libraries: ['places'],
    });

    const center = useMemo(() => {
        if (value.location_lat && value.location_lng) {
            return { lat: value.location_lat, lng: value.location_lng };
        }
        return containerStyle;
    }, [value.location_lat, value.location_lng]);

    const markerPosition = useMemo(() => {
        if (value.location_lat && value.location_lng) {
            return { lat: value.location_lat, lng: value.location_lng };
        }
        return undefined;
    }, [value.location_lat, value.location_lng]);

    const handlePlaceChanged = useCallback(() => {
        if (!searchBox) return;
        const place = searchBox.getPlace();
        if (!place || !place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        onChange({
            ...value,
            location: place.formatted_address ?? place.name ?? value.location ?? null,
            location_text: place.name ?? place.formatted_address ?? null,
            location_lat: lat,
            location_lng: lng,
            place_id: place.place_id ?? null,
            place_name: place.name ?? null,
            place_address: place.formatted_address ?? null,
        });
    }, [onChange, searchBox, value]);

    const handleMapClick = useCallback(
        (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            onChange({
                ...value,
                location_lat: lat,
                location_lng: lng,
                place_id: null,
                place_name: null,
                place_address: null,
            });
        },
        [onChange, value],
    );

    const clearLocation = () => {
        onChange({
            location: null,
            location_text: null,
            location_lat: null,
            location_lng: null,
            place_id: null,
            place_name: null,
            place_address: null,
        });
    };

    if (loadError) {
        return <div className="text-xs text-red-400">Failed to load map.</div>;
    }

    if (!isLoaded) {
        return (
            <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Loading map...
            </div>
        );
    }

    const hasLocation = !!(value.location_lat && value.location_lng);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <MapPin size={12} className="text-gray-500" />
                    <span>Task location</span>
                </div>
                {hasLocation && (
                    <button
                        type="button"
                        onClick={clearLocation}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
                    >
                        <X size={11} /> Clear
                    </button>
                )}
            </div>

            <Autocomplete
                onLoad={setSearchBox}
                onPlaceChanged={handlePlaceChanged}
            >
                <input
                    type="text"
                    placeholder="Search location or place"
                    className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
                    defaultValue={value.place_address ?? value.location ?? ''}
                />
            </Autocomplete>

            <div className="h-52 rounded-xl overflow-hidden border border-gray-800">
                <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={center}
                    zoom={hasLocation ? 15 : 13}
                    onClick={handleMapClick}
                    options={{
                        disableDefaultUI: true,
                        zoomControl: true,
                        streetViewControl: false,
                        mapTypeControl: false,
                    }}
                >
                    {markerPosition && (
                        <Marker
                            position={markerPosition}
                            draggable
                            onDragEnd={handleMapClick}
                        />
                    )}
                </GoogleMap>
            </div>

            {hasLocation && (
                <p className="text-[11px] text-gray-400">
                    {value.place_name && <span className="font-medium text-gray-200">{value.place_name}</span>}
                    {value.place_name && value.place_address && <span> · </span>}
                    {value.place_address && <span>{value.place_address}</span>}
                </p>
            )}
        </div>
    );
}

