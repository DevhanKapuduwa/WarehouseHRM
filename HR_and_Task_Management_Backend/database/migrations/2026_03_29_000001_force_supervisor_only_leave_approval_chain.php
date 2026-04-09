<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Ensure the approval chain is supervisor-only for all existing leave types.
        // This aligns persisted data with the new business rule.
        DB::table('leave_types')->update([
            'approval_chain_roles' => json_encode(['supervisor']),
        ]);
    }

    public function down(): void
    {
        // Intentionally not reversible: we cannot safely restore previous chains.
    }
};

