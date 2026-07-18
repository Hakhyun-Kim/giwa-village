@echo off
chcp 65001 >nul
REM 자동 시연 모드 — 서버+클라+봇을 띄우고, 키 조작 없이 전체 플로우를
REM 자막과 함께 자동 진행하는 브라우저를 연다. (ESC로 건너뛰기)
cd /d "%~dp0"
if not exist node_modules (
  echo [설치] 의존성 설치 중...
  call npm install
)
node scripts\launch-test.mjs --showcase
pause
