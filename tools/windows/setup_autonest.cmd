@echo off
rem Illustrator Auto Nesting - one-time setup of the Python engine (Windows 10/11)
rem Creates engine\.venv and installs requirements.txt. Needs Python 3.10+ from python.org.
rem Set AUTONEST_NOPAUSE=1 to run without the pauses.
setlocal
set "ROOT=%~dp0..\.."
set "BASEPY="
where py >nul 2>nul && set "BASEPY=py -3"
if not defined BASEPY (
  where python >nul 2>nul && set "BASEPY=python"
)
if not defined BASEPY (
  echo [autonest] Python not found. Install Python 3.10+ from https://www.python.org ^(check "Add python.exe to PATH"^).
  if not defined AUTONEST_NOPAUSE pause
  exit /b 1
)
%BASEPY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if errorlevel 1 (
  echo [autonest] Python 3.10 or later is required.
  if not defined AUTONEST_NOPAUSE pause
  exit /b 1
)
echo [autonest] Creating virtual environment: "%ROOT%\engine\.venv"
%BASEPY% -m venv "%ROOT%\engine\.venv" || goto :fail
"%ROOT%\engine\.venv\Scripts\python.exe" -m pip install --upgrade pip || goto :fail
"%ROOT%\engine\.venv\Scripts\python.exe" -m pip install -r "%ROOT%\requirements.txt" || goto :fail
echo [autonest] Self-test with the sample file...
"%ROOT%\engine\.venv\Scripts\python.exe" "%ROOT%\engine\nest_engine.py" analyze "%ROOT%\samples\sample_geometry.json" -o "%TEMP%\autonest_selftest.json"
if errorlevel 2 goto :fail
rem nest + independent verification on the sample (exit 4 = some groups intentionally invalid)
"%ROOT%\engine\.venv\Scripts\python.exe" "%ROOT%\engine\nest_engine.py" nest "%ROOT%\samples\sample_geometry.json" -o "%TEMP%\autonest_selftest_placement.json" --quality fast
if %ERRORLEVEL% EQU 1 goto :fail
if %ERRORLEVEL% GEQ 5 goto :fail
echo [autonest] Setup complete.
if not defined AUTONEST_NOPAUSE pause
exit /b 0
:fail
echo [autonest] Setup failed. See the error messages above.
if not defined AUTONEST_NOPAUSE pause
exit /b 1
