@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron runtime is missing.
  echo Run: npm install --ignore-scripts
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "scripts\dev-start.cjs"
