@echo off
rem Illustrator Auto Nesting - check the output of AutoNesting_SmokeTest_Standalone.jsx.
rem Usage: double-click (uses Documents\AutoNesting_SmokeTest, OneDrive Documents is tried too),
rem        or drag the AutoNesting_SmokeTest folder (or any file inside it) onto this file.
rem Writes smoke_check_report.txt, analysis.svg, placement.json, placement.svg into that folder.
setlocal
set "ROOT=%~dp0..\.."
set "PY=%ROOT%\engine\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [autonest] Engine is not installed. Run setup_autonest.cmd first.
  pause
  exit /b 1
)
if "%~1"=="" (
  "%PY%" "%ROOT%\tools\check_smoke.py"
) else (
  "%PY%" "%ROOT%\tools\check_smoke.py" "%~1"
)
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" echo [autonest] SMOKE CHECK: ALL PASSED.
if "%RC%"=="1" echo [autonest] SMOKE CHECK: SOME ITEMS FAILED. Send smoke_report.txt and smoke_check_report.txt to the developer.
if "%RC%"=="2" echo [autonest] geometry.json / smoke_expected.json not found. Run AutoNesting_SmokeTest_Standalone.jsx in Illustrator first.
pause
exit /b %RC%
