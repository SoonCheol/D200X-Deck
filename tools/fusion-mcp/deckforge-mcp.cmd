@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\DeckForge.exe" "%~dp0tools\fusion-mcp\server.cjs"
exit /b %ERRORLEVEL%
