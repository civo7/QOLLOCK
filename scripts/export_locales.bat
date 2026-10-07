@echo off
setlocal
REM Export only. No hidden pull, import, commit or push.
if not "%~1"=="" (
    node "%~dp0export_locales_json.js" %*
) else (
    node "%~dp0export_locales_json.js" "%~dp0..\..\QOLLOCK-translations\locales"
)
set "TASK_EXIT=%ERRORLEVEL%"
if "%~1"=="" pause
endlocal & exit /b %TASK_EXIT%

