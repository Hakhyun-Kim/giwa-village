@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo [설치] 의존성 설치 중...
  call npm install
)
node scripts\launch-test.mjs
pause
