@echo off
setlocal
REM Double-click  : pull the public mirror (QOLLOCK-translations) and export every language.
REM Drag & drop   : drop a <lang> folder or translation.json to export just that one (no pull).

set "SCRIPTS=%~dp0"
set "MIRROR=%~dp0..\..\QOLLOCK-translations\locales"
set "MIRROR_REPO=%~dp0..\..\QOLLOCK-translations"

if not "%~1"=="" (
    node "%SCRIPTS%import_locales_json.js" %*
    goto validate
)

if not exist "%MIRROR%" (
    echo Public mirror not found: %MIRROR%
    set EXIT_CODE=1
    goto done
)

if exist "%MIRROR_REPO%\.git" git -C "%MIRROR_REPO%" pull --ff-only

node "%SCRIPTS%export_locales_json.js" "%MIRROR%"

:validate
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" goto done
node --check "%SCRIPTS%..\panorama\scripts\ql_settings.js" && echo Syntax OK.

:done
pause
endlocal & exit /b %EXIT_CODE%
