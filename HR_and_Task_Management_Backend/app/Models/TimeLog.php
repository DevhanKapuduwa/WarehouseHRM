<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

class TimeLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'task_id',
        'clock_in',
        'clock_out',
        'duration_minutes',
        'notes',
    ];

    protected $casts = [
        'clock_in'  => 'datetime',
        'clock_out' => 'datetime',
    ];

    // ── Auto-calculate duration when clock_out is set ─

    public function setClockOutAttribute($value): void
    {
        $this->attributes['clock_out'] = $value;

        if ($value && isset($this->attributes['clock_in'])) {
            $this->attributes['duration_minutes'] =
                Carbon::parse($this->attributes['clock_in'])
                    ->diffInMinutes(Carbon::parse($value));
        }
    }

    // ── Relationships ─────────────────────────────────

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }
}