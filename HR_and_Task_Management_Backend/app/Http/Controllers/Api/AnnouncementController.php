<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class AnnouncementController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Announcement::with('creator:id,name')->latest()->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title'  => 'required|string',
            'body'   => 'required|string',
            'target' => 'required|in:all,workers,management',
        ]);

        $announcement = Announcement::create([
            'title'      => $request->title,
            'body'       => $request->body,
            'target'     => $request->target,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($announcement, 201);
    }

    public function destroy(Announcement $announcement): JsonResponse
    {
        $announcement->delete();
        return response()->json(['message' => 'Announcement deleted']);
    }
}