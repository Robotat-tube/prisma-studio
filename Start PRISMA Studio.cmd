@echo off
rem Starts PRISMA Scoping Review Studio on this PC and opens it in Chrome (or Edge). Close this window to stop it.
title PRISMA Scoping Review Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed: install it from https://nodejs.org and start this file again.
  pause
  exit /b 1
)

if not exist "node_modules\pdfjs-dist" (
  echo First start: installing the app's parts...
  call npm install --no-audit --no-fund
)

set "URL=http://localhost:8770/web/"
set "BROWSER="
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined BROWSER if exist %%B set "BROWSER=%%~B"
)

rem open the browser a moment after the server starts
if defined BROWSER (
  start "" cmd /c "timeout /t 2 >nul & start "" "%BROWSER%" --new-window "%URL%""
) else (
  start "" cmd /c "timeout /t 2 >nul & start "" "%URL%""
)

echo PRISMA Scoping Review Studio runs at %URL%  (close this window to stop it)
node scripts\serve.js 8770
