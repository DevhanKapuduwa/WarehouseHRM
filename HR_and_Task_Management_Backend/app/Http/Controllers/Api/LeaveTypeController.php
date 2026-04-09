<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeaveBalance;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class LeaveTypeController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(LeaveType::orderBy('name')->get());
    }

    public function active(): JsonResponse
    {
        return response()->json(
            LeaveType::where('is_active', true)->orderBy('name')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:leave_types,code',
            'is_paid' => 'boolean',
            'requires_attachment' => 'boolean',
            'is_active' => 'boolean',
            // Business rule: leave approval is supervisor-only.
            'approval_chain_roles' => 'sometimes|array',
            'yearly_entitlement_hours' => 'required|integer|min:0',
            'min_notice_hours' => 'integer|min:0',
            'max_consecutive_hours' => 'nullable|integer|min:1',
        ]);

        $lt = LeaveType::create([
            'name' => $request->name,
            'code' => $request->code,
            'is_paid' => $request->boolean('is_paid', true),
            'requires_attachment' => $request->boolean('requires_attachment', false),
            'is_active' => $request->boolean('is_active', true),
            'approval_chain_roles' => ['supervisor'],
            'yearly_entitlement_hours' => $request->yearly_entitlement_hours,
            'min_notice_hours' => $request->input('min_notice_hours', 0),
            'max_consecutive_hours' => $request->input('max_consecutive_hours'),
        ]);

        $this->seedBalancesForAllWorkers($lt);
        return response()->json($lt, 201);
    }

    public function update(Request $request, LeaveType $leaveType): JsonResponse
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'code' => 'sometimes|string|max:50|unique:leave_types,code,' . $leaveType->id,
            'is_paid' => 'boolean',
            'requires_attachment' => 'boolean',
            'is_active' => 'boolean',
            // Business rule: leave approval is supervisor-only.
            'approval_chain_roles' => 'sometimes|array',
            'yearly_entitlement_hours' => 'sometimes|integer|min:0',
            'min_notice_hours' => 'sometimes|integer|min:0',
            'max_consecutive_hours' => 'nullable|integer|min:1',
        ]);

        $oldEntitled = $leaveType->yearly_entitlement_hours;

        $leaveType->update([
            'name' => $request->name ?? $leaveType->name,
            'code' => $request->code ?? $leaveType->code,
            'is_paid' => $request->has('is_paid') ? $request->boolean('is_paid') : $leaveType->is_paid,
            'requires_attachment' => $request->has('requires_attachment') ? $request->boolean('requires_attachment') : $leaveType->requires_attachment,
            'is_active' => $request->has('is_active') ? $request->boolean('is_active') : $leaveType->is_active,
            'approval_chain_roles' => ['supervisor'],
            'yearly_entitlement_hours' => $request->yearly_entitlement_hours ?? $leaveType->yearly_entitlement_hours,
            'min_notice_hours' => $request->min_notice_hours ?? $leaveType->min_notice_hours,
            'max_consecutive_hours' => $request->has('max_consecutive_hours') ? $request->max_consecutive_hours : $leaveType->max_consecutive_hours,
        ]);

        if ($leaveType->yearly_entitlement_hours !== $oldEntitled) {
            $this->updateCurrentYearBalancesEntitlement($leaveType);
        }

        return response()->json($leaveType);
    }

    public function destroy(LeaveType $leaveType): JsonResponse
    {
        $leaveType->delete();
        return response()->json(['message' => 'Leave type deleted']);
    }

    private function seedBalancesForAllWorkers(LeaveType $leaveType): void
    {
        $year = (int) now()->format('Y');
        $workerIds = User::where('role', 'worker')->pluck('id');

        foreach ($workerIds as $uid) {
            LeaveBalance::firstOrCreate(
                ['user_id' => $uid, 'leave_type_id' => $leaveType->id, 'year' => $year],
                ['entitled_hours' => $leaveType->yearly_entitlement_hours, 'used_hours' => 0]
            );
        }
    }

    private function updateCurrentYearBalancesEntitlement(LeaveType $leaveType): void
    {
        $year = (int) now()->format('Y');
        LeaveBalance::where('leave_type_id', $leaveType->id)
            ->where('year', $year)
            ->update(['entitled_hours' => $leaveType->yearly_entitlement_hours]);
    }
}
