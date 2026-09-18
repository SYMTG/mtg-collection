@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --env-file=.env.local scripts\import-czn-economy.mjs
pause
