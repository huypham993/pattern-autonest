@echo off
rem Illustrator Auto Nesting - build the one-file installer dist\AutoNesting_Setup.exe. Run it on the build PC only;
rem copy AutoNesting_Setup.exe to any Windows PC and double-click it there (no Python needed on that PC).
setlocal
set "AUTONEST_NOPAUSE=1"
set "W=%~dp0tools\windows"
echo [autonest] Step 1 of 3: Python engine
"%~dp0engine\.venv\Scripts\python.exe" -c "import numpy, shapely, pyclipper" >nul 2>&1
if errorlevel 1 (
  call "%W%\setup_autonest.cmd" || goto :fail
) else (
  echo [autonest] Already set up.
)
echo [autonest] Step 2 of 3: building the panel. This takes about a minute ...
call "%W%\build_panel.cmd" || goto :fail
echo [autonest] Step 3 of 3: packing the installer
call :find_iscc
if not defined ISCC (
  echo [autonest] Inno Setup 6 is needed once on this PC to pack the installer.
  choice /M "[autonest] Install Inno Setup 6 now with winget"
  if errorlevel 2 goto :fail
  winget install --id JRSoftware.InnoSetup -e
  call :find_iscc
)
if not defined ISCC (
  echo [autonest] ISCC.exe of Inno Setup 6 was not found. Install it from https://jrsoftware.org/isdl.php and run this again.
  goto :fail
)
"%ISCC%" /Q "%~dp0installer\AutoNesting.iss" || goto :fail
echo.
echo [autonest] DONE: "%~dp0dist\AutoNesting_Setup.exe"
echo [autonest] Copy that one file to any Windows PC and double-click it, then restart Illustrator.
pause
exit /b 0
:fail
echo.
echo [autonest] BUILD FAILED. See the messages above.
pause
exit /b 1

:find_iscc
set "ISCC="
for %%p in ("%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 6\ISCC.exe" "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe") do if exist %%p set "ISCC=%%~p"
exit /b 0
