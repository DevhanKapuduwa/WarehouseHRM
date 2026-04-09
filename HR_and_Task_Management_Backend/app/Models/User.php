<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'employee_id',
        'department',
        'phone',
        'is_active',
        'avatar',
        'age',
        'gender',
        'education_level',
        'marital_status',
        'joined_date',
        'job_role',
        'salary',
        'work_location',
        'training_hours',
        'promotions',
        'absenteeism',
        'distance_from_home',
        'manager_feedback_score',
        'performance_rating',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'joined_date' => 'date',
        'salary' => 'decimal:2',
        'manager_feedback_score' => 'decimal:1',
        'performance_rating' => 'integer',
    ];

    // ── Relationships ─────────────────────────────────

    // Tasks assigned TO this user (worker's tasks)
    public function tasks()
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    // Tasks assigned BY this user (manager created these)
    public function assignedTasks()
    {
        return $this->hasMany(Task::class, 'assigned_by');
    }

    public function timeLogs()
    {
        return $this->hasMany(TimeLog::class);
    }

    public function shifts()
    {
        return $this->hasMany(Shift::class);
    }

    public function announcements()
    {
        return $this->hasMany(Announcement::class, 'created_by');
    }

    // ── Helper Methods ────────────────────────────────

    public function isManagement(): bool
    {
        return $this->role === 'management';
    }

    public function isWorker(): bool
    {
        return $this->role === 'worker';
    }
}