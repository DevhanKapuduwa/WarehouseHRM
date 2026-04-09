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
        Schema::create('leave_types', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('code')->unique();
            $table->boolean('is_paid')->default(true);
            $table->boolean('requires_attachment')->default(false);
            $table->boolean('is_active')->default(true);

            // Role-based approval chain, e.g. ["supervisor","hr","management"]
            $table->json('approval_chain_roles');

            // Yearly reset entitlements stored in hours for partial-day support.
            $table->unsignedInteger('yearly_entitlement_hours')->default(0);

            // Optional policy
            $table->unsignedInteger('min_notice_hours')->default(0);
            $table->unsignedInteger('max_consecutive_hours')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leave_types');
    }
};
