<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveApproval extends Model
{
    use HasFactory;

    protected $fillable = [
        'leave_request_id',
        'step_index',
        'required_role',
        'acted_by',
        'action',
        'comment',
        'acted_at',
    ];

    protected $casts = [
        'acted_at' => 'datetime',
    ];

    public function request()
    {
        return $this->belongsTo(LeaveRequest::class, 'leave_request_id');
    }

    public function leaveRequest()
    {
        return $this->belongsTo(LeaveRequest::class, 'leave_request_id');
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'acted_by');
    }
}
