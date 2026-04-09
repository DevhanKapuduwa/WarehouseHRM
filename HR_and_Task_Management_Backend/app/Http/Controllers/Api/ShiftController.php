<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Shift;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ShiftController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Shift::with('user:id,name,employee_id')->latest('date')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'user_id'    => 'required|exists:users,id',
            'shift_name' => 'required|string',
            'start_time' => 'required',
            'end_time'   => 'required',
            'date'       => 'required|date',
        ]);

        $shift = Shift::create($request->all());
        $shift->load('user:id,name');
        return response()->json($shift, 201);
    }

    public function destroy(Shift $shift): JsonResponse
    {
        $shift->delete();
        return response()->json(['message' => 'Shift deleted']);
    }
}