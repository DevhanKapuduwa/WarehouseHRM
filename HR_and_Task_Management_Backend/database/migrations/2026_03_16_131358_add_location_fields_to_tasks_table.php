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
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('location_text')->nullable()->after('location');
            $table->decimal('location_lat', 10, 7)->nullable()->after('location_text');
            $table->decimal('location_lng', 10, 7)->nullable()->after('location_lat');
            $table->string('place_id')->nullable()->after('location_lng');
            $table->string('place_name')->nullable()->after('place_id');
            $table->string('place_address')->nullable()->after('place_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn([
                'location_text',
                'location_lat',
                'location_lng',
                'place_id',
                'place_name',
                'place_address',
            ]);
        });
    }
};
