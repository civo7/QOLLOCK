$ErrorActionPreference = "Stop"
$ToolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$QollockRuntimeRoot = Join-Path $env:LOCALAPPDATA "QOLLOCK\chat_translation"
$QollockVenv = Join-Path $QollockRuntimeRoot ".venv"
$Python = Join-Path $QollockVenv "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
    New-Item -ItemType Directory -Force -Path $QollockRuntimeRoot | Out-Null
    py -3.12 -m venv $QollockVenv
}

& $Python -m pip install -r (Join-Path $ToolRoot "requirements.txt")
& $Python (Join-Path $ToolRoot "server.py")
