$ErrorActionPreference = "Stop"
$ToolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ToolRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
    py -3.12 -m venv (Join-Path $ToolRoot ".venv")
}

& $Python -m pip install -r (Join-Path $ToolRoot "requirements.txt")
& $Python (Join-Path $ToolRoot "server.py")
