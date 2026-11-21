@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
    echo Node.js 22 or newer is required.
    pause
    exit /b 1
)
echo Starting Lanebreak on http://127.0.0.1:8377
echo Leave this window open while playing.
echo If port 8377 is in use, stop the old Lanebreak Node window and try again.
echo You can leave the Cloudflare Tunnel window open.
node.exe lanebreak_server.js --host=127.0.0.1 --port=8377
if errorlevel 1 pause
