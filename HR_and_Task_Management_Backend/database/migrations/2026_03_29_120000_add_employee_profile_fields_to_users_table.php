<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedTinyInteger('age')->nullable();
            $table->string('gender', 32)->nullable();
            $table->string('education_level', 128)->nullable();
            $table->string('marital_status', 64)->nullable();
            $table->date('joined_date')->nullable();

            $table->string('job_role', 128)->nullable();
            $table->decimal('salary', 12, 2)->nullable();
            $table->string('work_location', 32)->nullable();
            $table->unsignedSmallInteger('training_hours')->nullable();
            $table->unsignedTinyInteger('promotions')->default(0);
            $table->unsignedSmallInteger('absenteeism')->nullable();
            $table->unsignedSmallInteger('distance_from_home')->nullable();
            $table->decimal('manager_feedback_score', 4, 1)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
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
            ]);
        });
    }
};
