@echo off
rem Illustrator Auto Nesting - Analyze step.
rem Usage: drag geometry.json (exported by Illustrator_AutoNesting.jsx) onto this file,
rem        or run: autonest_analyze.cmd "C:\path\to\geometry.json"
rem Writes analysis.json and analysis.svg next to the input file.
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
"%PY%" "%ROOT%\engine\nest_engine.py" analyze "%~1" -o "%~dp1analysis.json" --svg "%~dp1analysis.svg"
echo.
echo [autonest] Result: "%~dp1analysis.json"
echo [autonest] Silhouette preview: "%~dp1analysis.svg"
pause
