@echo off
setlocal
cd /d "%~dp0"
set "LANEBREAK_NODE=node.exe"
where node.exe >nul 2>&1
if errorlevel 1 set "LANEBREAK_NODE=%ProgramFiles%\nodejs\node.exe"
"%LANEBREAK_NODE%" --version >nul 2>&1
if errorlevel 1 (
    echo Node.js was not found in this window.
    echo Open a terminal where node --version works, or install Node.js LTS:
    echo winget install --id OpenJS.NodeJS.LTS --exact
    pause
    exit /b 1
)
"%LANEBREAK_NODE%" -e "process.exit(parseInt(process.versions.node, 10) >= 22 ? 0 : 1)"
if errorlevel 1 (
    echo Lanebreak needs Node.js 22 or newer. Detected:
    "%LANEBREAK_NODE%" --version
    pause
    exit /b 1
)
echo Starting Lanebreak on http://127.0.0.1:8377
echo Leave this window open while playing.
echo If port 8377 is in use, stop the old Lanebreak Node window and try again.
echo You can leave the Cloudflare Tunnel window open.
"%LANEBREAK_NODE%" build.js
if errorlevel 1 (
    pause
    exit /b 1
)
"%LANEBREAK_NODE%" lanebreak_server.js --host=127.0.0.1 --port=8377
if errorlevel 1 pause
