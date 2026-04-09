<?php

namespace App\Services;

use App\Models\EngagementEventAttendance;
use App\Models\Shift;
use App\Models\Task;
use App\Models\TimeLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class EmployeeProfileMetricsService
{
    /** Standard work day length (8 hours). */
    private const STANDARD_DAY_MINUTES = 480;

    /**
     * Completed top-level tasks (projects) for the worker.
     */
    public function projectsCompleted(User $user): int
    {
        return Task::query()
            ->where('assigned_to', $user->id)
            ->whereNull('parent_id')
            ->where('status', 'completed')
            ->count();
    }

    /**
     * Per calendar month: worked hours, overtime, shortage-driven absenteeism.
     * Overtime: per day, minutes worked beyond 8h count as overtime.
     * Shortage (unapproved): scheduled shift day with no completed work = 8h shortage;
     * otherwise first clock-in after shift start = lateness minutes (capped at 8h/day).
     * Absenteeism units = floor(total shortage minutes / 480) in that month;
     * remainder shown as shortage_hours_remainder.
     */
    public function monthlyWorkStats(User $user): array
    {
        $tz = config('app.timezone', 'UTC');

        $logs = TimeLog::query()
            ->where('user_id', $user->id)
            ->whereNotNull('clock_out')
            ->whereNotNull('duration_minutes')
            ->orderBy('clock_in')
            ->get(['clock_in', 'clock_out', 'duration_minutes']);

        /** @var Collection<string, Collection<int, TimeLog>> $logsByDate */
        $logsByDate = $logs->groupBy(fn (TimeLog $log) => Carbon::parse($log->clock_in, $tz)->toDateString());

        $shiftsByDate = $this->shiftsByDate($user, $tz);

        $firstLogDate = $logs->isEmpty()
            ? null
            : Carbon::parse($logs->first()->clock_in, $tz)->startOfDay();

        $firstShiftDate = $shiftsByDate->keys()->sort()->first();
        $firstShiftCarbon = $firstShiftDate
            ? Carbon::parse($firstShiftDate, $tz)->startOfDay()
            : null;

        $periodStart = null;
        if ($firstLogDate && $firstShiftCarbon) {
            $periodStart = $firstLogDate->lt($firstShiftCarbon) ? $firstLogDate : $firstShiftCarbon;
        } elseif ($firstLogDate) {
            $periodStart = $firstLogDate;
        } elseif ($firstShiftCarbon) {
            $periodStart = $firstShiftCarbon;
        }

        if ($periodStart === null) {
            return [];
        }

        $now = Carbon::now($tz);
        $cursor = $periodStart->copy()->startOfMonth();
        $endMonth = $now->copy()->startOfMonth();
        $out = [];

        while ($cursor->lte($endMonth)) {
            $out[] = $this->statsForMonth($cursor, $logsByDate, $shiftsByDate, $now, $tz);
            $cursor->addMonth();
        }

        return $out;
    }

    /**
     * Mean of each calendar month's total_hours_worked (includes zeros for months in range).
     */
    public function averageMonthlyHoursWorked(array $monthlyStats): float
    {
        if ($monthlyStats === []) {
            return 0.0;
        }

        $sum = 0.0;
        foreach ($monthlyStats as $row) {
            $sum += (float) ($row['total_hours_worked'] ?? 0);
        }

        return round($sum / count($monthlyStats), 1);
    }

    public function tenure(User $user): ?array
    {
        if (!$user->joined_date) {
            return null;
        }

        $from = Carbon::parse($user->joined_date)->startOfDay();
        $now = Carbon::now();
        $totalDays = (int) $from->diffInDays($now);

        $diff = $from->diff($now);
        $labelParts = [];
        if ($diff->y > 0) {
            $labelParts[] = $diff->y.' '.($diff->y === 1 ? 'year' : 'years');
        }
        if ($diff->m > 0) {
            $labelParts[] = $diff->m.' '.($diff->m === 1 ? 'month' : 'months');
        }
        if ($diff->d > 0 && $diff->y === 0) {
            $labelParts[] = $diff->d.' '.($diff->d === 1 ? 'day' : 'days');
        }
        $label = $labelParts !== [] ? implode(', ', $labelParts) : '0 days';

        return [
            'total_days' => $totalDays,
            'label' => $label,
        ];
    }

    /**
     * Share of engagement events where this worker was marked present (among all events they were marked for).
     */
    public function engagementAttendancePercent(User $user): ?float
    {
        $total = EngagementEventAttendance::query()
            ->where('user_id', $user->id)
            ->count();

        if ($total === 0) {
            return null;
        }

        $present = EngagementEventAttendance::query()
            ->where('user_id', $user->id)
            ->where('status', 'present')
            ->count();

        return round(100.0 * $present / $total, 1);
    }

    public function workLifeBalanceFromAttendance(?float $percent): ?string
    {
        if ($percent === null) {
            return null;
        }

        if ($percent < 20) {
            return 'Poor';
        }
        if ($percent < 50) {
            return 'Average';
        }
        if ($percent < 70) {
            return 'Good';
        }

        return 'Excellent';
    }

    public function all(User $user): array
    {
        $attendancePct = $this->engagementAttendancePercent($user);
        $monthly = $this->monthlyWorkStats($user);
        $nowKey = Carbon::now(config('app.timezone', 'UTC'))->format('Y-m');
        $current = collect($monthly)->firstWhere('year_month', $nowKey);

        if ($current === null && $monthly !== []) {
            $current = [
                'year_month' => $nowKey,
                'total_hours_worked' => 0.0,
                'overtime_hours' => 0.0,
                'shortage_minutes' => 0,
                'absenteeism_units' => 0,
                'shortage_hours_remainder' => 0.0,
            ];
        }

        return [
            'tenure' => $this->tenure($user),
            'projects_completed' => $this->projectsCompleted($user),
            /** Current calendar month (same keys as each monthly_work_stats row). */
            'overtime_hours' => (float) ($current['overtime_hours'] ?? 0),
            'absenteeism_units' => (int) ($current['absenteeism_units'] ?? 0),
            'shortage_hours_remainder' => (float) ($current['shortage_hours_remainder'] ?? 0),
            'total_hours_worked_this_month' => (float) ($current['total_hours_worked'] ?? 0),
            'average_monthly_hours_worked' => $this->averageMonthlyHoursWorked($monthly),
            'monthly_work_stats' => $monthly,
            'engagement_attendance_pct' => $attendancePct,
            'work_life_balance' => $this->workLifeBalanceFromAttendance($attendancePct),
        ];
    }

    /**
     * Earliest shift per calendar day (for expected start).
     *
     * @return Collection<string, Shift> date Y-m-d => Shift
     */
    private function shiftsByDate(User $user, string $tz): Collection
    {
        return Shift::query()
            ->where('user_id', $user->id)
            ->orderBy('date')
            ->orderBy('start_time')
            ->get()
            ->groupBy(fn (Shift $s) => Carbon::parse($s->date, $tz)->toDateString())
            ->map(fn (Collection $group) => $group->sortBy('start_time')->first());
    }

    /**
     * @param  Collection<string, Collection<int, TimeLog>>  $logsByDate
     * @param  Collection<string, Shift>  $shiftsByDate
     */
    private function statsForMonth(
        Carbon $monthStart,
        Collection $logsByDate,
        Collection $shiftsByDate,
        Carbon $now,
        string $tz
    ): array {
        $start = $monthStart->copy()->startOfMonth();
        $lastCalendarDayInMonth = $monthStart->copy()->endOfMonth()->startOfDay();
        $lastDayToIterate = $lastCalendarDayInMonth->lte($now) ? $lastCalendarDayInMonth : $now->copy()->startOfDay();

        $totalWorkedMinutes = 0;
        $overtimeMinutes = 0;
        $shortageMinutes = 0;

        $day = $start->copy();
        while ($day->lte($lastDayToIterate)) {
            $dateStr = $day->toDateString();
            /** @var Collection<int, TimeLog> $dayLogs */
            $dayLogs = $logsByDate->get($dateStr, collect());
            $worked = (int) $dayLogs->sum('duration_minutes');
            $totalWorkedMinutes += $worked;

            if ($worked > 0) {
                $overtimeMinutes += max(0, $worked - self::STANDARD_DAY_MINUTES);
            }

            $shift = $shiftsByDate->get($dateStr);
            if ($shift !== null) {
                $shortageMinutes += $this->shortageMinutesForShiftDay(
                    $day,
                    $shift,
                    $dayLogs,
                    $now,
                    $tz,
                    $worked
                );
            }

            $day->addDay();
        }

        $absUnits = intdiv($shortageMinutes, self::STANDARD_DAY_MINUTES);
        $remainderMin = $shortageMinutes % self::STANDARD_DAY_MINUTES;

        return [
            'year_month' => $monthStart->format('Y-m'),
            'total_hours_worked' => round($totalWorkedMinutes / 60, 1),
            'overtime_hours' => round($overtimeMinutes / 60, 1),
            'shortage_minutes' => $shortageMinutes,
            'absenteeism_units' => $absUnits,
            'shortage_hours_remainder' => round($remainderMin / 60, 1),
        ];
    }

    /**
     * @param  Collection<int, TimeLog>  $dayLogs
     */
    private function shortageMinutesForShiftDay(
        Carbon $day,
        Shift $shift,
        Collection $dayLogs,
        Carbon $now,
        string $tz,
        int $workedMinutes
    ): int {
        $isFutureDay = $day->isFuture();
        if ($isFutureDay) {
            return 0;
        }

        $hasCompletedLogs = $dayLogs->isNotEmpty();

        // Past day: shift scheduled but no completed work = full day unapproved absence (8h shortage).
        if ($day->lt($now->copy()->startOfDay())) {
            if (!$hasCompletedLogs || $workedMinutes === 0) {
                return self::STANDARD_DAY_MINUTES;
            }

            return $this->latenessShortageMinutes($shift, $dayLogs, $tz);
        }

        // Today: only lateness (do not count full-day absence until the day is over).
        $shiftEnd = $this->shiftDateTime($shift, 'end_time', $tz);
        if (!$hasCompletedLogs && $now->gte($shiftEnd)) {
            return self::STANDARD_DAY_MINUTES;
        }

        if ($hasCompletedLogs && $workedMinutes > 0) {
            return $this->latenessShortageMinutes($shift, $dayLogs, $tz);
        }

        return 0;
    }

    /**
     * @param  Collection<int, TimeLog>  $dayLogs
     */
    private function latenessShortageMinutes(Shift $shift, Collection $dayLogs, string $tz): int
    {
        $expectedStart = $this->shiftDateTime($shift, 'start_time', $tz);

        $firstIn = $dayLogs
            ->sortBy('clock_in')
            ->first()
            ?->clock_in;

        if ($firstIn === null) {
            return 0;
        }

        $first = Carbon::parse($firstIn, $tz);
        if ($first->lte($expectedStart)) {
            return 0;
        }

        $late = (int) $first->diffInMinutes($expectedStart);

        return min(self::STANDARD_DAY_MINUTES, $late);
    }

    private function shiftDateTime(Shift $shift, string $field, string $tz): Carbon
    {
        $dateStr = Carbon::parse($shift->date, $tz)->toDateString();
        $timeValue = $shift->{$field};

        if ($timeValue instanceof Carbon) {
            $timePart = $timeValue->format('H:i:s');
        } else {
            $timePart = (string) $timeValue;
        }

        return Carbon::parse($dateStr.' '.$timePart, $tz);
    }
}
