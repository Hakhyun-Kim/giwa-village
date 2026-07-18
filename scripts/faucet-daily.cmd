@echo off
chcp 65001 >nul
cd /d "%~dp0.."
node scripts\faucet-check.mjs --open
timeout /t 10
