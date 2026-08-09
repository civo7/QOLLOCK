$ErrorActionPreference = "Stop"
$ToolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$QollockRuntimeRoot = Join-Path $env:LOCALAPPDATA "QOLLOCK\chat_translation"
$QollockVenv = Join-Path $QollockRuntimeRoot ".venv"
$Python = Join-Path $QollockVenv "Scripts\python.exe"

try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 1
    if ($Health.ok) { exit 0 }
}
catch {
    # Expected when the helper is not already running.
}

if (-not (Test-Path -LiteralPath $Python)) {
    New-Item -ItemType Directory -Force -Path $QollockRuntimeRoot | Out-Null
    py -3.12 -m venv $QollockVenv
}

& $Python -m pip install -r (Join-Path $ToolRoot "requirements.txt")
& $Python (Join-Path $ToolRoot "server.py")
