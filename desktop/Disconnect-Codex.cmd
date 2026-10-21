@echo off
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0Codex Usage Monitor.exe" "%~dp0resources\app.asar\desktop\codex-integration.js" --remove
exit /b %ERRORLEVEL%
