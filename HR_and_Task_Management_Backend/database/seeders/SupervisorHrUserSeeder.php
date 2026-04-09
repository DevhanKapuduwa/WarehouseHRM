<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Ensures supervisor + HR accounts exist (management portal + leave approvals).
 * Run alone: php artisan db:seed --class=SupervisorHrUserSeeder
 */
class SupervisorHrUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'supervisor@warehouse.com'],
            [
                'name'        => 'Operations Supervisor',
                'password'    => Hash::make('password'),
                'role'        => 'supervisor',
                'employee_id' => 'SUP001',
                'department'  => 'Operations',
                'phone'       => '0772000001',
                'is_active'   => true,
            ]
        );

        User::updateOrCreate(
            ['email' => 'hr@warehouse.com'],
            [
                'name'        => 'HR Coordinator',
                'password'    => Hash::make('password'),
                'role'        => 'hr',
                'employee_id' => 'HR001',
                'department'  => 'Human Resources',
                'phone'       => '0772000002',
                'is_active'   => true,
            ]
        );
    }
}
