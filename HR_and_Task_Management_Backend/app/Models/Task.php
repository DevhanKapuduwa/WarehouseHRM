<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'assigned_to',
        'assigned_by',
        'status',
        'priority',
        'has_subtasks',
        'parent_id',
        'location',
        'location_text',
        'location_lat',
        'location_lng',
        'place_id',
        'place_name',
        'place_address',
        'due_date',
        'approval_notes',
    ];

    protected $casts = [
        'due_date'      => 'datetime',
        'location_lat'  => 'float',
        'location_lng'  => 'float',
        'has_subtasks'  => 'boolean',
    ];

    // ── Relationships ─────────────────────────────────

    // The worker this task is assigned to
    public function worker()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    // The manager who assigned this task
    public function manager()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    // Time logs recorded against this task
    public function timeLogs()
    {
        return $this->hasMany(TimeLog::class);
    }

    // Parent task (if this is a sub-task)
    public function parent()
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    // Sub-tasks of this parent task
    public function subtasks()
    {
        return $this->hasMany(Task::class, 'parent_id');
    }

    // Completion proof photos
    public function completionPhotos()
    {
        return $this->hasMany(TaskCompletionPhoto::class);
    }
}