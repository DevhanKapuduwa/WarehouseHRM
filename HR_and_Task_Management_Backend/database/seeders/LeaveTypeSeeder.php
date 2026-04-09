<?php

namespace Database\Seeders;

use App\Models\LeaveBalance;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Database\Seeder;

class LeaveTypeSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $defaults = [
            [
                'name' => 'Annual Leave',
                'code' => 'ANNUAL',
                'is_paid' => true,
                'requires_attachment' => false,
                'is_active' => true,
                'approval_chain_roles' => ['supervisor'],
                'yearly_entitlement_hours' => 112,
                'min_notice_hours' => 24,
                'max_consecutive_hours' => 80,
            ],
            [
                'name' => 'Sick Leave',
                'code' => 'SICK',
                'is_paid' => true,
                'requires_attachment' => true,
                'is_active' => true,
                'approval_chain_roles' => ['supervisor'],
                'yearly_entitlement_hours' => 56,
                'min_notice_hours' => 0,
                'max_consecutive_hours' => 40,
            ],
            [
                'name' => 'Casual Leave',
                'code' => 'CASUAL',
                'is_paid' => true,
                'requires_attachment' => false,
                'is_active' => true,
                'approval_chain_roles' => ['supervisor'],
                'yearly_entitlement_hours' => 40,
                'min_notice_hours' => 0,
                'max_consecutive_hours' => 16,
            ],
            [
                'name' => 'Unpaid Leave',
                'code' => 'UNPAID',
                'is_paid' => false,
                'requires_attachment' => false,
                'is_active' => true,
                'approval_chain_roles' => ['supervisor'],
                'yearly_entitlement_hours' => 100000,
                'min_notice_hours' => 0,
                'max_consecutive_hours' => null,
            ],
        ];

        foreach ($defaults as $d) {
            LeaveType::updateOrCreate(
                ['code' => $d['code']],
                $d
            );
        }

        // Ensure balances exist for all active workers for current year
        $year = (int) now()->format('Y');
        $types = LeaveType::where('is_active', true)->get();
        $workers = User::where('role', 'worker')->get(['id']);

        foreach ($workers as $w) {
            foreach ($types as $t) {
                LeaveBalance::firstOrCreate(
                    ['user_id' => $w->id, 'leave_type_id' => $t->id, 'year' => $year],
                    ['entitled_hours' => $t->yearly_entitlement_hours, 'used_hours' => 0]
                );
            }
        }
    }
}
