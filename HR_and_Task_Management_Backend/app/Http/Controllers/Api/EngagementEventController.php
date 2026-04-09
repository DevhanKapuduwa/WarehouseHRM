<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EngagementEvent;
use App\Models\EngagementEventAttendance;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class EngagementEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = EngagementEvent::query()
            ->withCount([
                'attendances as present_count' => fn ($qq) => $qq->where('status', 'present'),
                'attendances as absent_count' => fn ($qq) => $qq->where('status', 'absent'),
            ])
            ->with('creator:id,name');

        if ($request->filled('from')) {
            $q->where('starts_at', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $q->where('starts_at', '<=', $request->input('to'));
        }

        return response()->json($q->orderByDesc('starts_at')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'starts_at' => 'required|date',
            'ends_at' => 'nullable|date|after_or_equal:starts_at',
            'location_text' => 'nullable|string|max:255',
            'location_lat' => 'nullable|numeric',
            'location_lng' => 'nullable|numeric',
        ]);

        $event = EngagementEvent::create([
            'title' => $request->title,
            'description' => $request->description,
            'starts_at' => $request->starts_at,
            'ends_at' => $request->ends_at,
            'location_text' => $request->location_text,
            'location_lat' => $request->location_lat,
            'location_lng' => $request->location_lng,
            'created_by' => $request->user()->id,
        ]);

        $event->load('creator:id,name');
        return response()->json($event, 201);
    }

    public function show(EngagementEvent $event): JsonResponse
    {
        $event->load([
            'creator:id,name',
            'attendances.user:id,name,employee_id,department',
            'attendances.marker:id,name',
        ]);

        return response()->json([
            'event' => $event,
            'attendance' => [
                'present' => $event->attendances->where('status', 'present')->count(),
                'absent' => $event->attendances->where('status', 'absent')->count(),
                'total_marked' => $event->attendances->count(),
            ],
        ]);
    }

    public function update(Request $request, EngagementEvent $event): JsonResponse
    {
        $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'starts_at' => 'sometimes|date',
            'ends_at' => 'nullable|date',
            'location_text' => 'nullable|string|max:255',
            'location_lat' => 'nullable|numeric',
            'location_lng' => 'nullable|numeric',
        ]);

        $event->update([
            'title' => $request->title ?? $event->title,
            'description' => $request->description ?? $event->description,
            'starts_at' => $request->starts_at ?? $event->starts_at,
            'ends_at' => $request->ends_at ?? $event->ends_at,
            'location_text' => $request->location_text ?? $event->location_text,
            'location_lat' => $request->location_lat ?? $event->location_lat,
            'location_lng' => $request->location_lng ?? $event->location_lng,
        ]);

        return response()->json($event);
    }

    public function destroy(EngagementEvent $event): JsonResponse
    {
        $event->delete();
        return response()->json(['message' => 'Event deleted']);
    }

    public function upsertAttendance(Request $request, EngagementEvent $event): JsonResponse
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.user_id' => 'required|exists:users,id',
            'items.*.status' => 'required|in:present,absent',
            'items.*.note' => 'nullable|string|max:255',
        ]);

        $workerIds = User::where('role', 'worker')
            ->whereIn('id', collect($request->items)->pluck('user_id')->all())
            ->pluck('id')
            ->all();

        $allowed = array_flip($workerIds);
        $now = now();

        foreach ($request->items as $item) {
            if (!isset($allowed[$item['user_id']])) {
                continue;
            }

            EngagementEventAttendance::updateOrCreate(
                ['event_id' => $event->id, 'user_id' => $item['user_id']],
                [
                    'status' => $item['status'],
                    'note' => $item['note'] ?? null,
                    'marked_by' => $request->user()->id,
                    'marked_at' => $now,
                ]
            );
        }

        return $this->show($event->fresh());
    }
}
