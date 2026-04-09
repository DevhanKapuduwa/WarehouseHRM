<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // MySQL ENUM needs raw ALTER to add new values.
        // If you use a different DB engine in future, adjust accordingly.
        DB::statement("ALTER TABLE users MODIFY role ENUM('management','worker','supervisor','hr') NOT NULL DEFAULT 'worker'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY role ENUM('management','worker') NOT NULL DEFAULT 'worker'");
    }
};
