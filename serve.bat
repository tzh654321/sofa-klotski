@echo off
title Sofa Klotski - Level Writer
cd /d "%~dp0"
set "NODEEXE=C:\Users\tzh\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not exist "%NODEEXE%" set "NODEEXE=node"
echo Starting local server, browser will open automatically.
echo Keep this window open while editing; close it to stop the server.
echo.
"%NODEEXE%" tools\serve.js --port 8765 --open
echo.
echo Server stopped.
pause
