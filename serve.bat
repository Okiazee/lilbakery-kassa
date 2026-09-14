@echo off
rem Startar kassan pa denna dator sa att den kan oppnas fran iPad eller telefon pa samma wifi.
cd /d "%~dp0"
set "PY=..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
echo.
echo   lil'bakery Kassa kors nu. Oppna pa en enhet i samma wifi:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "ip=%%a"
  call echo     http://%%ip: =%%:8765/
)
echo   Pa den har datorn: http://localhost:8765/
echo   Stang med Ctrl+C
echo.
start "" http://localhost:8765/
"%PY%" -m http.server 8765 --bind 0.0.0.0
