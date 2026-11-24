@echo off
rem Illustrator Auto Nesting - build the panel folder dist\panel\com.autonest.panel
rem (panel UI + host script + autonest.exe built with PyInstaller). Needs engine\.venv: run setup_autonest.cmd first.
rem Set AUTONEST_NOPAUSE=1 to run without the final pause.
setlocal
set "ROOT=%~dp0..\.."
set "PY=%ROOT%\engine\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [autonest] The engine is not set up. Run setup_autonest.cmd first.
  goto :fail
)
if not exist "%ROOT%\dist\AutoNesting_PanelHost.jsx" (
  echo [autonest] dist\AutoNesting_PanelHost.jsx is missing.
  goto :fail
)
echo [autonest] Installing PyInstaller into engine\.venv ...
"%PY%" -m pip install --disable-pip-version-check -q "pyinstaller>=6.10" || goto :fail
set "WORK=%ROOT%\build\pyinstaller"
echo [autonest] Building autonest.exe ...
"%PY%" -m PyInstaller --noconfirm --clean --log-level WARN --name autonest --onedir --console --paths "%ROOT%\engine" --collect-submodules autonest --distpath "%WORK%\dist" --workpath "%WORK%\build" --specpath "%WORK%" "%ROOT%\engine\nest_engine.py" || goto :fail
set "OUT=%ROOT%\dist\panel\com.autonest.panel"
if exist "%OUT%" rmdir /s /q "%OUT%"
robocopy "%ROOT%\panel" "%OUT%" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
mkdir "%OUT%\jsx"
copy /y "%ROOT%\dist\AutoNesting_PanelHost.jsx" "%OUT%\jsx\" >nul || goto :fail
robocopy "%WORK%\dist\autonest" "%OUT%\engine\autonest" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
echo [autonest] Self-test: autonest.exe on samples\sample_geometry.json ...
"%OUT%\engine\autonest\autonest.exe" nest "%ROOT%\samples\sample_geometry.json" -o "%TEMP%\autonest_exe_selftest.json" --quality fast --time-limit 5
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 4 goto :fail
echo [autonest] Self-test: parallel workers on fixtures\geometry\03_bezier_40.geometry.json ...
"%OUT%\engine\autonest\autonest.exe" nest "%ROOT%\fixtures\geometry\03_bezier_40.geometry.json" -o "%TEMP%\autonest_exe_selftest2.json" --quality fast --time-limit 20 --workers 2
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 4 goto :fail
echo [autonest] Panel built: "%OUT%"
if not defined AUTONEST_NOPAUSE echo [autonest] Next: run install_panel.cmd
if not defined AUTONEST_NOPAUSE pause
exit /b 0
:fail
echo [autonest] Build FAILED. See the messages above.
if not defined AUTONEST_NOPAUSE pause
exit /b 1
