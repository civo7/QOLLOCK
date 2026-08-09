$ErrorActionPreference = "Stop"
$TaskName = "QOLLOCK Local Chat Translation"
$ToolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$HiddenLauncher = Join-Path $ToolRoot "launch_hidden.vbs"
$WScript = (Get-Command "wscript.exe").Source
$Arguments = "`"$HiddenLauncher`""

$Action = New-ScheduledTaskAction -Execute $WScript -Argument $Arguments
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Starts the personal QOLLOCK Russian chat translation helper at sign-in." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started scheduled task: $TaskName"
Write-Host "Health check: http://127.0.0.1:8765/health"
