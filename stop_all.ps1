# ============================================================
#  STOP ALL SERVICES
#  Kills: PHP (artisan), Node/Vite, Uvicorn (Python), step8
# ============================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "   Stopping All Services..." -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host ""

# ── Stop PHP (artisan serve) ──
Write-Host "Stopping PHP (artisan serve)..." -ForegroundColor Yellow
Get-Process -Name "php" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  Done." -ForegroundColor Green

# ── Stop Node / Vite (npm run dev) ──
Write-Host "Stopping Node/Vite (npm run dev)..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  Done." -ForegroundColor Green

# ── Stop Python (uvicorn + step8) ──
Write-Host "Stopping Python processes (uvicorn + step8)..." -ForegroundColor Yellow
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  Done." -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   All services stopped." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
