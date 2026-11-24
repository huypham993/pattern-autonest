@echo off
rem Illustrator Auto Nesting - remove the panel. PlayerDebugMode is left on (other unsigned panels may need it).
setlocal
set "DST=%APPDATA%\Adobe\CEP\extensions\com.autonest.panel"
if exist "%DST%" rmdir /s /q "%DST%"
if exist "%DST%" (
  echo [autonest] Could not remove "%DST%". Close Illustrator and try again.
  if not defined AUTONEST_NOPAUSE pause
  exit /b 1
)
echo [autonest] Panel removed. Restart Illustrator.
if not defined AUTONEST_NOPAUSE pause
exit /b 0
