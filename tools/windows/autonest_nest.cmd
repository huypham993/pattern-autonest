@echo off
rem Illustrator Auto Nesting - Nest step (Phase 3A, true shape, fixed artboard).
rem Usage: drag geometry.json (exported by Illustrator_AutoNesting_Standalone.jsx) onto this file,
rem        or run: autonest_nest.cmd "C:\path\to\geometry.json" [extra options, e.g. --quality high_quality]
rem Writes placement.json and placement.svg next to the input file. Illustrator is NOT modified (Apply = Phase 4).
setlocal
set "ROOT=%~dp0..\.."
set "PY=%ROOT%\engine\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [autonest] Engine is not installed. Run setup_autonest.cmd first.
  pause
  exit /b 1
)
if "%~1"=="" (
  echo [autonest] Drag and drop geometry.json onto this script.
  pause
  exit /b 1
)
set "IN=%~1"
set "OUTDIR=%~dp1"
shift
set "EXTRA="
:args
if "%~1"=="" goto run
set "EXTRA=%EXTRA% %1"
shift
goto args
:run
"%PY%" "%ROOT%\engine\nest_engine.py" nest "%IN%" -o "%OUTDIR%placement.json" --svg "%OUTDIR%placement.svg" %EXTRA%
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" echo [autonest] All Groups nested and independently verified: no collisions, spacing respected, inside the artboard.
if "%RC%"=="4" echo [autonest] Partially nested (independently verified). Unplaced Groups are listed above and in placement.json.
if "%RC%"=="5" echo [autonest] VERIFICATION FAILED: no placement exported. Send placement.json to the developer.
if "%RC%"=="3" echo [autonest] No valid Groups to nest. Run autonest_analyze.cmd to see the errors.
echo [autonest] Result: "%OUTDIR%placement.json"
echo [autonest] Preview: "%OUTDIR%placement.svg"
pause
exit /b %RC%
