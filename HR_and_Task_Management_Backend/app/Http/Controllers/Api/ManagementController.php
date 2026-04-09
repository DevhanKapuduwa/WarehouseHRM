<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Task;
use App\Models\TimeLog;
use App\Models\Announcement;
use Illuminate\Http\JsonResponse;

class ManagementController extends Controller
{
    public function stats(): JsonResponse
    {
        return response()->json([
            'total_workers'   => User::where('role', 'worker')->count(),
            'active_workers'  => User::where('role', 'worker')->where('is_active', true)->count(),
            'pending_tasks'   => Task::where('status', 'pending')->count(),
            'in_progress'     => Task::where('status', 'in_progress')->count(),
            'completed_today' => Task::where('status', 'completed')
                                    ->whereDate('updated_at', today())->count(),
            'pending_approval'=> Task::where('status', 'pending_approval')->count(),
            'clocked_in_now'  => TimeLog::whereNull('clock_out')->count(),
            'recent_tasks'    => Task::with('worker:id,name,employee_id')
                                    ->latest()->take(8)->get(),
            'announcements'   => Announcement::with('creator:id,name')
                                    ->latest()->take(5)->get(),
        ]);
    }
}