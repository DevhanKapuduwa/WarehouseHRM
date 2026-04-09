<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('parent_id')->nullable()->after('id');
            $table->boolean('has_subtasks')->default(false)->after('priority');
            $table->text('approval_notes')->nullable()->after('due_date');

            $table->foreign('parent_id')
                  ->references('id')
                  ->on('tasks')
                  ->onDelete('cascade');
        });

        // For SQLite we need to recreate the column to change the enum
        // For MySQL we can alter directly
        if (config('database.default') === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY COLUMN status ENUM('pending','in_progress','completed','cancelled','pending_approval') DEFAULT 'pending'");
        }

        // Create photos table
        Schema::create('task_completion_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('tasks')->onDelete('cascade');
            $table->string('photo_path');
            $table->string('photo_url');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_completion_photos');

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropColumn(['parent_id', 'has_subtasks', 'approval_notes']);
        });

        if (config('database.default') === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY COLUMN status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending'");
        }
    }
};
