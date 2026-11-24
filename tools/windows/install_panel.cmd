@echo off
rem Illustrator Auto Nesting - install the panel for the current Windows user.
rem Copies com.autonest.panel to %APPDATA%\Adobe\CEP\extensions and enables unsigned panels
rem (PlayerDebugMode=1 for CSXS 9-13). Then restart Illustrator: Window > Extensions > AutoNesting.
rem Set AUTONEST_NOPAUSE=1 to run without the final pause.
setlocal
set "SRC=%~dp0com.autonest.panel"
if not exist "%SRC%\CSXS\manifest.xml" set "SRC=%~dp0..\..\dist\panel\com.autonest.panel"
if not exist "%SRC%\CSXS\manifest.xml" (
  echo [autonest] Panel folder not found. Run build_panel.cmd first.
  goto :fail
)
if not exist "%SRC%\engine\autonest\autonest.exe" (
  echo [autonest] autonest.exe is missing in "%SRC%". Run build_panel.cmd again.
  goto :fail
)
set "DST=%APPDATA%\Adobe\CEP\extensions\com.autonest.panel"
tasklist /FI "IMAGENAME eq Illustrator.exe" 2>nul | find /I "Illustrator.exe" >nul && echo [autonest] Illustrator is running: restart it after the install to load the panel.
robocopy "%SRC%" "%DST%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
for %%v in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul || goto :fail
echo [autonest] Installed to "%DST%"
echo [autonest] Restart Illustrator, then open Window ^> Extensions ^> AutoNesting.
if not defined AUTONEST_NOPAUSE pause
exit /b 0
:fail
echo [autonest] Install FAILED.
if not defined AUTONEST_NOPAUSE pause
exit /b 1
