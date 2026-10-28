@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org ^(LTS^) & pause & exit /b)
if not exist node_modules (echo Installing, first time only... & call npm install)
start "" http://localhost:3000
node server.js
pause
