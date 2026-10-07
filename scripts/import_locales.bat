@echo off
setlocal
REM Three-way integration only. Review with --dry-run first; no hidden Git actions.
if not "%~1"=="" (
    node "%~dp0sync_translations.js" %*
) else (
    node "%~dp0sync_translations.js" "%~dp0..\..\QOLLOCK-translations\locales"
)
set "TASK_EXIT=%ERRORLEVEL%"
if "%~1"=="" pause
endlocal & exit /b %TASK_EXIT%

