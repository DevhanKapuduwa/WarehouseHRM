<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TimeLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class TimeLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = TimeLog::with(['user:id,name,employee_id', 'task:id,title']);

        if ($request->has('worker_id')) $query->where('user_id', $request->worker_id);
        if ($request->has('date'))      $query->whereDate('clock_in', $request->date);

        return response()->json($query->latest('clock_in')->get());
    }

    public function workerLogs(User $worker): JsonResponse
    {
        $logs = TimeLog::where('user_id', $worker->id)
                       ->with('task:id,title')
                       ->latest('clock_in')->get();
        return response()->json($logs);
    }

    public function clockIn(Request $request): JsonResponse
    {
        $user     = $request->user();
        $existing = TimeLog::where('user_id', $user->id)->whereNull('clock_out')->first();

        if ($existing) {
            return response()->json([
                'message' => 'Already clocked in since ' . $existing->clock_in->format('H:i')
            ], 400);
        }

        $log = TimeLog::create([
            'user_id'  => $user->id,
            'task_id'  => $request->task_id ?? null,
            'clock_in' => now(),
        ]);

        return response()->json(['message' => 'Clocked in at ' . now()->format('H:i'), 'log' => $log]);
    }

    public function clockOut(Request $request): JsonResponse
    {
        $log = TimeLog::where('user_id', $request->user()->id)
                      ->whereNull('clock_out')->first();

        if (!$log) {
            return response()->json(['message' => 'Not clocked in'], 400);
        }

        $log->clock_out = now();
        $log->save();

        return response()->json([
            'message'          => 'Clocked out. Duration: ' . $log->duration_minutes . ' mins',
            'duration_minutes' => $log->duration_minutes,
            'log'              => $log,
        ]);
    }

    public function myHours(Request $request): JsonResponse
    {
        $user  = $request->user();
        $logs  = TimeLog::where('user_id', $user->id)->with('task:id,title')->latest()->get();
        $week  = TimeLog::where('user_id', $user->id)
                        ->whereBetween('clock_in', [now()->startOfWeek(), now()])
                        ->sum('duration_minutes');
        $month = TimeLog::where('user_id', $user->id)
                        ->whereBetween('clock_in', [now()->startOfMonth(), now()])
                        ->sum('duration_minutes');

        return response()->json([
            'logs'              => $logs,
            'week_hours'        => round($week / 60, 2),
            'month_hours'       => round($month / 60, 2),
        ]);
    }
}