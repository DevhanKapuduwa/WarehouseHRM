# ============================================================
#  START ALL SERVICES
#  Run this once to launch the entire application stack.
# ============================================================

$BackendDir  = "D:\Data managment\HR_and_Task_Management_Backend"
$ModelDir    = "D:\Data managment\model"
$FaceDir     = "D:\Data managment\faceDetection"
$PythonBin   = "D:\Data managment\faceDetection\venv\Scripts\python.exe"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Launching All Services..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Build frontend assets (runs inline, waits to finish) ──
Write-Host "[1/6] Building frontend assets (npm run build)..." -ForegroundColor Yellow
Set-Location $BackendDir
npm run build
Write-Host "      Done." -ForegroundColor Green
Write-Host ""

# ── Step 2: Laravel Backend ──
Write-Host "[2/6] Starting Laravel backend (php artisan serve)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$BackendDir'; php artisan serve" `
    -WindowStyle Normal
Write-Host "      -> http://localhost:8000" -ForegroundColor Green
Start-Sleep -Seconds 2

# ── Step 3: Vite Dev Server ──
Write-Host "[3/6] Starting Vite dev server (npm run dev)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$BackendDir'; npm run dev" `
    -WindowStyle Normal
Write-Host "      -> http://localhost:5173" -ForegroundColor Green
Start-Sleep -Seconds 1

# ── Step 4: Churn Prediction FastAPI ──
Write-Host "[4/6] Starting Churn API (uvicorn port 8001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$ModelDir'; uvicorn churn_api:app --host 0.0.0.0 --port 8001 --reload" `
    -WindowStyle Normal
Write-Host "      -> http://localhost:8001" -ForegroundColor Green
Start-Sleep -Seconds 1

# ── Step 5: Face Enrollment (runs inline, waits to finish) ──
Write-Host "[5/6] Running face enrollment (step5_enroll_build_db.py)..." -ForegroundColor Yellow
Set-Location $FaceDir
& $PythonBin step5_enroll_build_db.py
Write-Host "      Done." -ForegroundColor Green
Write-Host ""

# ── Step 6: Face Attendance + Photo Capture ──
Write-Host "[6/6] Starting face attendance + photo capture (step8)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$FaceDir'; & '$PythonBin' step8_attendance_with_photos.py" `
    -WindowStyle Normal
Write-Host "      -> Saving photos to faceEmotionAWS/database/" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   All services launched!" -ForegroundColor Cyan
Write-Host "   Open your browser: http://localhost:5173" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
