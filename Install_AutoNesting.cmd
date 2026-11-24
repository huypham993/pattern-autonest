@echo off
rem Illustrator Auto Nesting - one click install: sets up the Python engine (first time only),
rem builds the panel (autonest.exe) and installs it for the current Windows user.
setlocal
set "AUTONEST_NOPAUSE=1"
set "W=%~dp0tools\windows"
echo [autonest] Step 1 of 3: Python engine
rem set up again if an earlier install stopped half way (venv there, packages missing)
"%~dp0engine\.venv\Scripts\python.exe" -c "import numpy, shapely, pyclipper" >nul 2>&1
if errorlevel 1 (
  call "%W%\setup_autonest.cmd" || goto :fail
) else (
  echo [autonest] Already set up.
)
echo [autonest] Step 2 of 3: building the panel. This takes about a minute ...
call "%W%\build_panel.cmd" || goto :fail
echo [autonest] Step 3 of 3: installing the panel
call "%W%\install_panel.cmd" || goto :fail
echo.
echo [autonest] DONE. Restart Illustrator, then open Window ^> Extensions ^> AutoNesting.
pause
exit /b 0
:fail
echo.
echo [autonest] INSTALL FAILED. See the messages above.
pause
exit /b 1
