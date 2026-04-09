<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'leave_type_id',
        'start_at',
        'end_at',
        'duration_hours',
        'reason',
        'attachment_path',
        'status',
        'current_step',
        'submitted_at',
        'decision_at',
    ];

    protected $casts = [
        'start_at' => 'datetime',
        'end_at' => 'datetime',
        'submitted_at' => 'datetime',
        'decision_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function leaveType()
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function approvals()
    {
        return $this->hasMany(LeaveApproval::class);
    }
}
