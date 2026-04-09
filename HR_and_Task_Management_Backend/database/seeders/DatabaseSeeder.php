<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Task;
use App\Models\Shift;
use App\Models\Announcement;
use App\Models\LeaveType;
use App\Models\LeaveBalance;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Seed default leave types (enum-like codes) if none exist
        if (LeaveType::count() === 0) {
            $defaults = [
                [
                    'name' => 'Annual Leave',
                    'code' => 'ANNUAL',
                    'is_paid' => true,
                    'requires_attachment' => false,
                    'is_active' => true,
                    'approval_chain_roles' => ['supervisor'],
                    'yearly_entitlement_hours' => 112, // 14 days * 8h
                    'min_notice_hours' => 24,
                    'max_consecutive_hours' => 80, // 10 days * 8h
                ],
                [
                    'name' => 'Sick Leave',
                    'code' => 'SICK',
                    'is_paid' => true,
                    'requires_attachment' => true,
                    'is_active' => true,
                    'approval_chain_roles' => ['supervisor'],
                    'yearly_entitlement_hours' => 56, // 7 days * 8h
                    'min_notice_hours' => 0,
                    'max_consecutive_hours' => 40, // 5 days * 8h
                ],
                [
                    'name' => 'Casual Leave',
                    'code' => 'CASUAL',
                    'is_paid' => true,
                    'requires_attachment' => false,
                    'is_active' => true,
                    'approval_chain_roles' => ['supervisor'],
                    'yearly_entitlement_hours' => 40, // 5 days * 8h
                    'min_notice_hours' => 0,
                    'max_consecutive_hours' => 16, // 2 days * 8h
                ],
                [
                    'name' => 'Unpaid Leave',
                    'code' => 'UNPAID',
                    'is_paid' => false,
                    'requires_attachment' => false,
                    'is_active' => true,
                    'approval_chain_roles' => ['supervisor'],
                    'yearly_entitlement_hours' => 100000, // effectively unlimited
                    'min_notice_hours' => 0,
                    'max_consecutive_hours' => null,
                ],
            ];

            foreach ($defaults as $d) {
                LeaveType::create($d);
            }
        }

        // Create manager
        $manager = User::create([
            'name'        => 'Warehouse Manager',
            'email'       => 'manager@warehouse.com',
            'password'    => Hash::make('password'),
            'role'        => 'management',
            'employee_id' => 'MGR001',
            'department'  => 'Management',
            'phone'       => '0771234567',
            'is_active'   => true,
        ]);

        $this->call(SupervisorHrUserSeeder::class);

        // Create workers
        $worker1 = User::create([
            'name'        => 'John Silva',
            'email'       => 'john@warehouse.com',
            'password'    => Hash::make('password'),
            'role'        => 'worker',
            'employee_id' => 'WRK001',
            'department'  => 'Receiving',
            'phone'       => '0779876543',
            'is_active'   => true,
        ]);

        $worker2 = User::create([
            'name'        => 'Priya Fernando',
            'email'       => 'priya@warehouse.com',
            'password'    => Hash::make('password'),
            'role'        => 'worker',
            'employee_id' => 'WRK002',
            'department'  => 'Dispatch',
            'phone'       => '0771112222',
            'is_active'   => true,
        ]);

        // Seed current-year leave balances for workers
        $year = (int) now()->format('Y');
        $leaveTypes = LeaveType::where('is_active', true)->get();
        foreach ([$worker1, $worker2] as $w) {
            foreach ($leaveTypes as $lt) {
                LeaveBalance::firstOrCreate(
                    ['user_id' => $w->id, 'leave_type_id' => $lt->id, 'year' => $year],
                    ['entitled_hours' => $lt->yearly_entitlement_hours, 'used_hours' => 0]
                );
            }
        }

        // Create tasks
        Task::create([
            'title'       => 'Unload Container A12',
            'description' => 'Unload and sort all items from container A12',
            'assigned_to' => $worker1->id,
            'assigned_by' => $manager->id,
            'status'      => 'pending',
            'priority'    => 'high',
            'location'    => 'Bay 3 - Zone A',
            'due_date'    => now()->addHours(4),
        ]);

        Task::create([
            'title'       => 'Stock Shelves - Row 5',
            'description' => 'Restock items on Row 5 from yesterday delivery',
            'assigned_to' => $worker2->id,
            'assigned_by' => $manager->id,
            'status'      => 'in_progress',
            'priority'    => 'medium',
            'location'    => 'Row 5',
            'due_date'    => now()->addHours(2),
        ]);

        // Create shifts
        Shift::create([
            'user_id'    => $worker1->id,
            'shift_name' => 'Morning Shift',
            'start_time' => '06:00:00',
            'end_time'   => '14:00:00',
            'date'       => today(),
        ]);

        Shift::create([
            'user_id'    => $worker2->id,
            'shift_name' => 'Afternoon Shift',
            'start_time' => '14:00:00',
            'end_time'   => '22:00:00',
            'date'       => today(),
        ]);

        // Create announcement
        Announcement::create([
            'title'      => 'Safety Reminder',
            'body'       => 'Please wear safety boots in all warehouse zones at all times.',
            'created_by' => $manager->id,
            'target'     => 'all',
        ]);
    }
}