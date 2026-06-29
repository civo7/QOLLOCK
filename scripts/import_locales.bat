@echo off
setlocal
REM Merge translations/locales/*.json back into panorama/scripts/ql_settings.js,
REM then validate the result. Double-click to import every language, or drag a
REM <lang> folder / translation.json onto this file to import just that one.
REM (import_locales_json.js resolves the repo root itself, so the working
REM directory doesn't matter.)

node "%~dp0import_locales_json.js" %*
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" goto done

echo.
echo Validating ql_settings.js ...
node --check "%~dp0..\panorama\scripts\ql_settings.js"
set EXIT_CODE=%ERRORLEVEL%

:done
echo.
echo Done (exit code %EXIT_CODE%). Repack the VPK to see changes in-game.
pause
endlocal & exit /b %EXIT_CODE%
