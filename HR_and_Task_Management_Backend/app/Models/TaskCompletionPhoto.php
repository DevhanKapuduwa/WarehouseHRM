<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskCompletionPhoto extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'photo_path',
        'photo_url',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }
}
