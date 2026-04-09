<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('leave_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_request_id')->constrained('leave_requests')->cascadeOnDelete();
            $table->unsignedInteger('step_index');
            $table->string('required_role');

            $table->foreignId('acted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('action', ['approved', 'rejected'])->nullable();
            $table->string('comment')->nullable();
            $table->dateTime('acted_at')->nullable();
            $table->timestamps();

            $table->unique(['leave_request_id', 'step_index']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leave_approvals');
    }
};
