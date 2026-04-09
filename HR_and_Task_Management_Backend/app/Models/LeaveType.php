<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'is_paid',
        'requires_attachment',
        'is_active',
        'approval_chain_roles',
        'yearly_entitlement_hours',
        'min_notice_hours',
        'max_consecutive_hours',
    ];

    protected $casts = [
        'is_paid' => 'boolean',
        'requires_attachment' => 'boolean',
        'is_active' => 'boolean',
        'approval_chain_roles' => 'array',
    ];

    public function requests()
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
