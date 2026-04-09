<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ManagementController;
use App\Http\Controllers\Api\WorkerController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TimeLogController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\EngagementEventController;
use App\Http\Controllers\Api\LeaveTypeController;
use App\Http\Controllers\Api\LeaveRequestController;
use App\Http\Controllers\Api\FaceRecognitionController;
use App\Http\Controllers\Api\ChurnController;

// ── Public ────────────────────────────────────────────
Route::post('/login', [AuthController::class, 'login']);

// MJPEG proxy — must be public because <img> tags cannot send Bearer tokens
Route::get('face/live-stream/proxy', [FaceRecognitionController::class, 'proxyLiveStream']);

// ── Protected ─────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me',      [AuthController::class, 'me']);

    // ── Management portal: read-only data for supervisor / HR / management ──
    //    (mutations stay in the management-only group below.)
    Route::middleware('role:management,supervisor,hr')->group(function () {
        Route::get('dashboard/stats', [ManagementController::class, 'stats']);

        Route::get('workers', [WorkerController::class, 'index']);

        // ── Churn prediction (all workers — must be before {worker} wildcard) ─
        Route::get('workers/churn', [ChurnController::class, 'index']);

        Route::get('workers/{worker}', [WorkerController::class, 'show']);
        Route::get('workers/{worker}/churn', [ChurnController::class, 'show']);

        // — Emotion details: scan face photos for a worker via AWS Rekognition —
        Route::get('workers/{worker}/emotion-details', [FaceRecognitionController::class, 'workerEmotionDetails']);

        Route::get('tasks', [TaskController::class, 'index']);
        Route::get('tasks/{task}', [TaskController::class, 'show']);

        Route::get('time-logs', [TimeLogController::class, 'index']);
        Route::get('time-logs/{worker}', [TimeLogController::class, 'workerLogs']);

        Route::get('shifts', [ShiftController::class, 'index']);

        Route::get('announcements', [AnnouncementController::class, 'index']);

        Route::get('engagement/events', [EngagementEventController::class, 'index']);
        Route::get('engagement/events/{event}', [EngagementEventController::class, 'show']);
        Route::get('face/logs', [FaceRecognitionController::class, 'managementLogs']);
        Route::get('face/live-stream/status', [FaceRecognitionController::class, 'liveStreamStatus']);
        Route::post('face/live-stream/start', [FaceRecognitionController::class, 'startLiveStream']);
    });

    // ── Management only (create / update / delete) ───────────────────────────
    Route::middleware('role:management')->group(function () {
        Route::post('workers', [WorkerController::class, 'store']);
        Route::put('workers/{worker}', [WorkerController::class, 'update']);
        Route::patch('workers/{worker}', [WorkerController::class, 'update']);
        Route::delete('workers/{worker}', [WorkerController::class, 'destroy']);
        Route::patch('workers/{worker}/toggle-status', [WorkerController::class, 'toggleStatus']);

        Route::post('tasks', [TaskController::class, 'store']);
        Route::put('tasks/{task}', [TaskController::class, 'update']);
        Route::patch('tasks/{task}', [TaskController::class, 'update']);
        Route::delete('tasks/{task}', [TaskController::class, 'destroy']);
        Route::patch('tasks/{task}/status', [TaskController::class, 'updateStatus']);
        Route::patch('tasks/{task}/approve-completion', [TaskController::class, 'approveCompletion']);
        Route::patch('tasks/{task}/reject-completion', [TaskController::class, 'rejectCompletion']);

        Route::post('shifts', [ShiftController::class, 'store']);
        Route::delete('shifts/{shift}', [ShiftController::class, 'destroy']);

        Route::post('announcements', [AnnouncementController::class, 'store']);
        Route::delete('announcements/{announcement}', [AnnouncementController::class, 'destroy']);

        Route::post('leave/types', [LeaveTypeController::class, 'store']);
        Route::put('leave/types/{leaveType}', [LeaveTypeController::class, 'update']);
        Route::delete('leave/types/{leaveType}', [LeaveTypeController::class, 'destroy']);
    });

    // Engagement events: management owns policy; HR coordinators record attendance and manage events.
    Route::middleware('role:management,hr')->group(function () {
        Route::post('engagement/events', [EngagementEventController::class, 'store']);
        Route::put('engagement/events/{event}', [EngagementEventController::class, 'update']);
        Route::delete('engagement/events/{event}', [EngagementEventController::class, 'destroy']);
        Route::put('engagement/events/{event}/attendance', [EngagementEventController::class, 'upsertAttendance']);
    });

    // ── Worker only ───────────────────────────────────
    Route::middleware('role:worker')->group(function () {
        Route::get('worker/dashboard',                 [WorkerController::class, 'dashboard']);
        Route::get('worker/my-tasks',                  [WorkerController::class, 'myTasks']);
        Route::patch('worker/tasks/{taskId}/start',    [WorkerController::class, 'startTask']);
        Route::post('worker/tasks/{taskId}/complete-subtask', [WorkerController::class, 'completeSubTask']);
        Route::patch('worker/tasks/{taskId}/complete', [WorkerController::class, 'completeTask']);
        Route::post('worker/tasks/{taskId}/submit-completion', [WorkerController::class, 'submitForApproval']);
        Route::post('worker/clock-in',                 [TimeLogController::class, 'clockIn']);
        Route::post('worker/clock-out',                [TimeLogController::class, 'clockOut']);
        Route::get('worker/my-hours',                  [TimeLogController::class, 'myHours']);
        Route::get('worker/my-shift',                  [WorkerController::class, 'myShift']);
        Route::get('worker/profile',                 [WorkerController::class, 'myProfile']);
        Route::patch('worker/profile',               [WorkerController::class, 'updateMyProfile']);

        // Leave requests (worker)
        Route::get('worker/leave/types', [LeaveTypeController::class, 'active']);
        Route::get('worker/leave/requests', [LeaveRequestController::class, 'myRequests']);
        Route::get('worker/leave/balances', [LeaveRequestController::class, 'myBalances']);
        Route::post('worker/leave/requests', [LeaveRequestController::class, 'store']);
        Route::get('worker/face-logs', [FaceRecognitionController::class, 'workerLogs']);
    });

    // Approvers: supervisor/hr/management (role-based chain)
    Route::middleware('role:supervisor,hr,management')->group(function () {
        Route::get('leave/requests', [LeaveRequestController::class, 'adminIndex']);
        Route::get('leave/inbox', [LeaveRequestController::class, 'inbox']);
        Route::post('leave/requests/{leaveRequest}/act', [LeaveRequestController::class, 'act']);
        Route::get('leave/types', [LeaveTypeController::class, 'index']);
    });
});
