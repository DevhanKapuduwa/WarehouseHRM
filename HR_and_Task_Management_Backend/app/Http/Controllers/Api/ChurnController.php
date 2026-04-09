<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\EmployeeProfileMetricsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ChurnController extends Controller
{
    public function __construct(
        private EmployeeProfileMetricsService $profileMetrics
    ) {}

    /**
     * Fetch churn predictions for all active workers.
     *
     * GET /api/workers/churn
     *
     * Management calls this endpoint to get churn risk for the entire workforce.
     * The method collects the 21 model features for each worker (combining static
     * DB fields with live metrics computed by EmployeeProfileMetricsService), then
     * batches them to the Python FastAPI churn service.
     *
     * @return JsonResponse
     */
    public function index(): JsonResponse
    {
        $apiUrl = rtrim(env('CHURN_API_URL', 'http://127.0.0.1:8001'), '/');

        // ── 1. Load all workers ───────────────────────────────────────────
        $workers = User::where('role', 'worker')
            ->where('is_active', true)
            ->get();

        if ($workers->isEmpty()) {
            return response()->json([
                'threshold' => null,
                'results'   => [],
            ]);
        }

        // ── 2. Build the feature payload for each worker ──────────────────
        $employees = $workers->map(function (User $worker) {
            $metrics = $this->profileMetrics->all($worker);

            // tenure: years from joined_date → today (float)
            $tenureYears = null;
            if ($worker->joined_date) {
                $tenureYears = round(
                    Carbon::parse($worker->joined_date)->diffInDays(now()) / 365.25,
                    2
                );
            }

            // Satisfaction Level: we derive it from engagement attendance % (0–1 scale)
            // Attendance pct is 0-100; convert → 0-1 for the model.
            $attendancePct = $metrics['engagement_attendance_pct'];
            $satisfactionLevel = $attendancePct !== null
                ? round($attendancePct / 100, 4)
                : null;

            return [
                'employee_id'                => (string) ($worker->employee_id ?? $worker->id),
                'name'                       => $worker->name,

                // Ordinal categoricals
                'work_life_balance'          => $metrics['work_life_balance'],
                'education_level'            => $worker->education_level,

                // Nominal categoricals
                'gender'                     => $worker->gender,
                'marital_status'             => $worker->marital_status,
                'job_role'                   => $worker->job_role,
                'department'                 => $worker->department,
                'work_location'              => $worker->work_location,

                // Numeric
                'age'                        => $worker->age !== null ? (float) $worker->age : null,
                'tenure'                     => $tenureYears,
                'salary'                     => $worker->salary !== null ? (float) $worker->salary : null,
                'performance_rating'         => $worker->performance_rating !== null ? (float) $worker->performance_rating : null,
                'projects_completed'         => (float) ($metrics['projects_completed'] ?? 0),
                'training_hours'             => $worker->training_hours !== null ? (float) $worker->training_hours : null,
                'promotions'                 => $worker->promotions !== null ? (float) $worker->promotions : null,
                'overtime_hours'             => (float) ($metrics['overtime_hours'] ?? 0),
                'satisfaction_level'         => $satisfactionLevel,
                'average_monthly_hours_worked' => (float) ($metrics['average_monthly_hours_worked'] ?? 0),
                'absenteeism'               => $worker->absenteeism !== null
                    ? (float) $worker->absenteeism
                    : (float) ($metrics['absenteeism_units'] ?? 0),
                'distance_from_home'         => $worker->distance_from_home !== null ? (float) $worker->distance_from_home : null,
                'manager_feedback_score'     => $worker->manager_feedback_score !== null ? (float) $worker->manager_feedback_score : null,
            ];
        })->values()->toArray();

        // ── 3. Call FastAPI churn service ─────────────────────────────────
        try {
            $response = Http::timeout(30)->post("{$apiUrl}/predict-batch", [
                'employees' => $employees,
            ]);

            if ($response->failed()) {
                Log::error('Churn API error', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return response()->json([
                    'message' => 'Churn service returned an error: ' . $response->body(),
                ], 502);
            }

            $data = $response->json();

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Churn API unreachable', ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Churn service is not running. Start it with: uvicorn churn_api:app --port 8001',
            ], 503);
        }

        // ── 4. Merge churn results back with worker profile ───────────────
        // Build an index by employee_id for fast lookup
        $resultsByEmpId = collect($data['results'] ?? [])
            ->keyBy('employee_id');

        $enriched = $workers->map(function (User $worker) use ($resultsByEmpId) {
            $key    = (string) ($worker->employee_id ?? $worker->id);
            $result = $resultsByEmpId->get($key, []);

            return [
                'id'               => $worker->id,
                'employee_id'      => $worker->employee_id,
                'name'             => $worker->name,
                'department'       => $worker->department,
                'job_role'         => $worker->job_role,
                'avatar'           => $worker->avatar,
                'churn_prob'       => $result['churn_prob'] ?? null,
                'churn_pred'       => $result['churn_pred'] ?? null,
                'risk_label'       => $result['risk_label'] ?? 'Unknown',
            ];
        })->sortByDesc('churn_prob')->values();

        return response()->json([
            'threshold' => $data['threshold'] ?? null,
            'results'   => $enriched,
        ]);
    }

    /**
     * Fetch churn prediction for a single worker.
     *
     * GET /api/workers/{worker}/churn
     */
    public function show(User $worker): JsonResponse
    {
        if ($worker->role !== 'worker') {
            abort(404);
        }

        $apiUrl  = rtrim(env('CHURN_API_URL', 'http://127.0.0.1:8001'), '/');
        $metrics = $this->profileMetrics->all($worker);

        $tenureYears = null;
        if ($worker->joined_date) {
            $tenureYears = round(
                Carbon::parse($worker->joined_date)->diffInDays(now()) / 365.25,
                2
            );
        }

        $attendancePct     = $metrics['engagement_attendance_pct'];
        $satisfactionLevel = $attendancePct !== null
            ? round($attendancePct / 100, 4)
            : null;

        $employee = [
            'employee_id'                => (string) ($worker->employee_id ?? $worker->id),
            'name'                       => $worker->name,
            'work_life_balance'          => $metrics['work_life_balance'],
            'education_level'            => $worker->education_level,
            'gender'                     => $worker->gender,
            'marital_status'             => $worker->marital_status,
            'job_role'                   => $worker->job_role,
            'department'                 => $worker->department,
            'work_location'              => $worker->work_location,
            'age'                        => $worker->age !== null ? (float) $worker->age : null,
            'tenure'                     => $tenureYears,
            'salary'                     => $worker->salary !== null ? (float) $worker->salary : null,
            'performance_rating'         => $worker->performance_rating !== null ? (float) $worker->performance_rating : null,
            'projects_completed'         => (float) ($metrics['projects_completed'] ?? 0),
            'training_hours'             => $worker->training_hours !== null ? (float) $worker->training_hours : null,
            'promotions'                 => $worker->promotions !== null ? (float) $worker->promotions : null,
            'overtime_hours'             => (float) ($metrics['overtime_hours'] ?? 0),
            'satisfaction_level'         => $satisfactionLevel,
            'average_monthly_hours_worked' => (float) ($metrics['average_monthly_hours_worked'] ?? 0),
            'absenteeism'               => $worker->absenteeism !== null
                ? (float) $worker->absenteeism
                : (float) ($metrics['absenteeism_units'] ?? 0),
            'distance_from_home'         => $worker->distance_from_home !== null ? (float) $worker->distance_from_home : null,
            'manager_feedback_score'     => $worker->manager_feedback_score !== null ? (float) $worker->manager_feedback_score : null,
        ];

        try {
            $response = Http::timeout(15)->post("{$apiUrl}/predict", $employee);

            if ($response->failed()) {
                return response()->json([
                    'message' => 'Churn service returned an error: ' . $response->body(),
                ], 502);
            }

            $data = $response->json();

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            return response()->json([
                'message' => 'Churn service is not running.',
            ], 503);
        }

        $result = $data['results'][0] ?? [];

        return response()->json([
            'threshold'        => $data['threshold'] ?? null,
            'worker'           => [
                'id'          => $worker->id,
                'employee_id' => $worker->employee_id,
                'name'        => $worker->name,
                'department'  => $worker->department,
                'job_role'    => $worker->job_role,
            ],
            'features_used'    => $employee,
            'churn_prob'       => $result['churn_prob'] ?? null,
            'churn_pred'       => $result['churn_pred'] ?? null,
            'risk_label'       => $result['risk_label'] ?? 'Unknown',
        ]);
    }
}
