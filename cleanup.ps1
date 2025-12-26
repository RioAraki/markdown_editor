# Cleanup script for Next.js permission issues
Write-Host "Stopping Node processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Removing .next directory..." -ForegroundColor Yellow
if (Test-Path .next) {
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Write-Host ".next directory removed successfully" -ForegroundColor Green
} else {
    Write-Host ".next directory does not exist" -ForegroundColor Gray
}

Write-Host "`nStarting development server on port 3002..." -ForegroundColor Yellow
npm run dev

Write-Host "`nServer should be running at:" -ForegroundColor Green
Write-Host "http://localhost:3002" -ForegroundColor Cyan
