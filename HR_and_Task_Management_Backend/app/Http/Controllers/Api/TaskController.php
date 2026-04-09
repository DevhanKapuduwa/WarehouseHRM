<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::with([
            'worker:id,name,employee_id,department',
            'manager:id,name',
            'subtasks.worker:id,name,employee_id',
            'subtasks.completionPhotos',
            'completionPhotos',
        ])->whereNull('parent_id'); // Only top-level tasks

        if ($request->has('status'))    $query->where('status', $request->status);
        if ($request->has('worker_id')) $query->where('assigned_to', $request->worker_id);
        if ($request->has('priority'))  $query->where('priority', $request->priority);

        return response()->json($query->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title'         => 'required|string|max:255',
            'description'   => 'nullable|string',
            'worker_id'     => 'required|exists:users,id',
            'priority'      => 'required|in:low,medium,high',
            'has_subtasks'  => 'sometimes|boolean',
            'parent_id'     => 'nullable|exists:tasks,id',
            'location'      => 'nullable|string',
            'location_text' => 'nullable|string',
            'location_lat'  => 'nullable|numeric',
            'location_lng'  => 'nullable|numeric',
            'place_id'      => 'nullable|string',
            'place_name'    => 'nullable|string',
            'place_address' => 'nullable|string',
            'due_date'      => 'nullable|date',
            // Sub-tasks array (optional)
            'subtasks'             => 'nullable|array',
            'subtasks.*.title'     => 'required_with:subtasks|string|max:255',
            'subtasks.*.description' => 'nullable|string',
        ]);

        $task = Task::create([
            'title'         => $request->title,
            'description'   => $request->description,
            'assigned_to'   => $request->worker_id,
            'assigned_by'   => $request->user()->id,
            'priority'      => $request->priority,
            'has_subtasks'  => $request->boolean('has_subtasks', false),
            'parent_id'     => $request->parent_id,
            'location'      => $request->location,
            'location_text' => $request->location_text,
            'location_lat'  => $request->location_lat,
            'location_lng'  => $request->location_lng,
            'place_id'      => $request->place_id,
            'place_name'    => $request->place_name,
            'place_address' => $request->place_address,
            'due_date'      => $request->due_date,
            'status'        => 'pending',
        ]);

        // Create sub-tasks if provided
        if ($request->has_subtasks && $request->has('subtasks')) {
            foreach ($request->subtasks as $sub) {
                Task::create([
                    'title'        => $sub['title'],
                    'description'  => $sub['description'] ?? null,
                    'assigned_to'  => $request->worker_id,
                    'assigned_by'  => $request->user()->id,
                    'priority'     => $request->priority,
                    'parent_id'    => $task->id,
                    'location'     => $request->location,
                    'location_text' => $request->location_text,
                    'location_lat'  => $request->location_lat,
                    'location_lng'  => $request->location_lng,
                    'place_id'      => $request->place_id,
                    'place_name'    => $request->place_name,
                    'place_address' => $request->place_address,
                    'due_date'     => $request->due_date,
                    'status'       => 'pending',
                ]);
            }
        }

        $task->load(['worker:id,name', 'manager:id,name', 'subtasks']);
        return response()->json($task, 201);
    }

    public function show(Task $task): JsonResponse
    {
        $task->load([
            'worker',
            'manager',
            'timeLogs.user',
            'subtasks.worker:id,name,employee_id',
            'subtasks.completionPhotos',
            'completionPhotos',
        ]);
        return response()->json($task);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $request->validate([
            'title'         => 'sometimes|string',
            'description'   => 'nullable|string',
            'worker_id'     => 'sometimes|exists:users,id',
            'priority'      => 'sometimes|in:low,medium,high',
            'has_subtasks'  => 'sometimes|boolean',
            'location'      => 'nullable|string',
            'location_text' => 'nullable|string',
            'location_lat'  => 'nullable|numeric',
            'location_lng'  => 'nullable|numeric',
            'place_id'      => 'nullable|string',
            'place_name'    => 'nullable|string',
            'place_address' => 'nullable|string',
            'due_date'      => 'nullable|date',
            'status'        => 'sometimes|in:pending,in_progress,completed,cancelled,pending_approval',
            // Sub-tasks array (optional)
            'subtasks'             => 'nullable|array',
            'subtasks.*.id'        => 'nullable|exists:tasks,id',
            'subtasks.*.title'     => 'required_with:subtasks|string|max:255',
            'subtasks.*.description' => 'nullable|string',
        ]);

        $task->update([
            'title'         => $request->title       ?? $task->title,
            'description'   => $request->description ?? $task->description,
            'assigned_to'   => $request->worker_id   ?? $task->assigned_to,
            'priority'      => $request->priority    ?? $task->priority,
            'has_subtasks'  => $request->has('has_subtasks') ? $request->boolean('has_subtasks') : $task->has_subtasks,
            'location'      => $request->location    ?? $task->location,
            'location_text' => $request->location_text ?? $task->location_text,
            'location_lat'  => $request->location_lat  ?? $task->location_lat,
            'location_lng'  => $request->location_lng  ?? $task->location_lng,
            'place_id'      => $request->place_id      ?? $task->place_id,
            'place_name'    => $request->place_name    ?? $task->place_name,
            'place_address' => $request->place_address ?? $task->place_address,
            'due_date'      => $request->due_date    ?? $task->due_date,
            'status'        => $request->status      ?? $task->status,
        ]);

        // Update sub-tasks if provided
        if ($request->has('subtasks') && $task->has_subtasks) {
            $existingSubIds = $task->subtasks->pluck('id')->toArray();
            $incomingSubIds = [];

            foreach ($request->subtasks as $sub) {
                if (!empty($sub['id'])) {
                    // Update existing sub-task
                    $subTask = Task::find($sub['id']);
                    if ($subTask && $subTask->parent_id === $task->id) {
                        $subTask->update([
                            'title'       => $sub['title'],
                            'description' => $sub['description'] ?? null,
                        ]);
                        $incomingSubIds[] = $sub['id'];
                    }
                } else {
                    // Create new sub-task
                    $newSub = Task::create([
                        'title'        => $sub['title'],
                        'description'  => $sub['description'] ?? null,
                        'assigned_to'  => $task->assigned_to,
                        'assigned_by'  => $request->user()->id,
                        'priority'     => $task->priority,
                        'parent_id'    => $task->id,
                        'location'     => $task->location,
                        'location_text' => $task->location_text,
                        'location_lat'  => $task->location_lat,
                        'location_lng'  => $task->location_lng,
                        'place_id'      => $task->place_id,
                        'place_name'    => $task->place_name,
                        'place_address' => $task->place_address,
                        'due_date'     => $task->due_date,
                        'status'       => 'pending',
                    ]);
                    $incomingSubIds[] = $newSub->id;
                }
            }

            // Delete removed sub-tasks
            $toDelete = array_diff($existingSubIds, $incomingSubIds);
            if (!empty($toDelete)) {
                Task::whereIn('id', $toDelete)->where('parent_id', $task->id)->delete();
            }
        }

        $task->load(['subtasks', 'completionPhotos']);
        return response()->json($task);
    }

    public function updateStatus(Request $request, Task $task): JsonResponse
    {
        $request->validate(['status' => 'required|in:pending,in_progress,completed,cancelled,pending_approval']);
        $task->update(['status' => $request->status]);
        return response()->json(['message' => 'Status updated', 'task' => $task]);
    }

    /**
     * Management approves a worker's completion request.
     */
    public function approveCompletion(Request $request, Task $task): JsonResponse
    {
        if ($task->status !== 'pending_approval') {
            return response()->json(['message' => 'Task is not pending approval'], 400);
        }

        $task->update([
            'status' => 'completed',
            'approval_notes' => $request->notes ?? null,
        ]);

        // If this is a sub-task, check if all siblings are completed
        if ($task->parent_id) {
            $parent = $task->parent;
            $allSubsDone = $parent->subtasks()
                ->where('status', '!=', 'completed')
                ->doesntExist();

            if ($allSubsDone) {
                $parent->update(['status' => 'completed']);
            }
        }

        $task->load(['completionPhotos', 'subtasks']);
        return response()->json(['message' => 'Task completion approved', 'task' => $task]);
    }

    /**
     * Management rejects a worker's completion request.
     */
    public function rejectCompletion(Request $request, Task $task): JsonResponse
    {
        if ($task->status !== 'pending_approval') {
            return response()->json(['message' => 'Task is not pending approval'], 400);
        }

        $request->validate([
            'notes' => 'required|string|max:1000',
        ]);

        $task->update([
            'status' => 'in_progress',
            'approval_notes' => $request->notes,
        ]);

        $task->load(['completionPhotos', 'subtasks']);
        return response()->json(['message' => 'Task completion rejected', 'task' => $task]);
    }

    public function destroy(Task $task): JsonResponse
    {
        $task->delete();
        return response()->json(['message' => 'Task deleted']);
    }
}