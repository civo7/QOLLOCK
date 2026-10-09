param(
    [string[]]$ChangedFiles,
    [switch]$NoLaunch,
    [switch]$AutoApproveNewFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SourceRoot = "C:\Users\civ\Desktop\Deadlock Modding\MODS\SOURCE_QOLLOCK"
$ContentStageRoot = "C:\Users\civ\Desktop\Deadlock Modding\Reduced_CSDK_12\Reduced_CSDK_12\content\citadel_addons\qollock_pipeline"
$GameStageRoot = "C:\Users\civ\Desktop\Deadlock Modding\Reduced_CSDK_12\Reduced_CSDK_12\game\citadel_addons\qollock_pipeline"
$FinalUnpackedRoot = "C:\Users\civ\Desktop\Deadlock Modding\MODS\QOLLOCK"
$LivePakPath = "C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel\addons\pak47_dir.vpk"
$PackLogRoot = "C:\Users\civ\Desktop\Deadlock Modding\MODS\PACKLOG_QOLLOCK"
$DeadlockExe = "C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\bin\win64\deadlock.exe"
$SteamExe = "C:\Program Files (x86)\Steam\steam.exe"
$DeadlockAppId = "1422450"
$ResourceCompiler = "C:\Users\civ\Desktop\Deadlock Modding\Reduced_CSDK_12\Reduced_CSDK_12\game\bin_cs2\win64\resourcecompiler.exe"
$Packer = "C:\Users\civ\Desktop\Deadlock Modding\Reduced_CSDK_12\Reduced_CSDK_12\game\bin\win64\CSDKCfgVPK.exe"
$VersionSourceFile = Join-Path $SourceRoot "panorama\scripts\ql_settings.js"
$SchemaGuardScript = Join-Path $SourceRoot "scripts\validate_compact_schema.js"
$JsMinifyScript = Join-Path $SourceRoot "scripts\minify_panorama_js.js"
$RuntimeCompilePathPrefixes = @(
    "panorama\",
    "soundevents\",
    "sounds\"
)

# Accept additional positional file arguments if the shell failed to bind
# all values to -ChangedFiles.
if ($args -and $args.Count -gt 0) {
    foreach ($extraArg in $args) {
        if (-not $extraArg) { continue }
        if ($extraArg.ToString().StartsWith("-")) { continue }
        if (-not $ChangedFiles) {
            $ChangedFiles = @($extraArg.ToString())
        }
        else {
            $ChangedFiles += $extraArg.ToString()
        }
    }
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -Path $Path -ItemType Directory -Force | Out-Null
    }
}

function Require-ExistingPath {
    param(
        [string]$Path,
        [string]$Label
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Clear-DirectoryContents {
    param([string]$Path)
    Ensure-Directory -Path $Path
    $children = Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Remove-Item -LiteralPath $child.FullName -Recurse -Force
    }
}

function Stop-DeadlockIfRunning {
    $running = Get-Process -Name "deadlock" -ErrorAction SilentlyContinue
    if (-not $running) {
        Write-Host "[Pipeline] Deadlock is not running."
        return
    }

    Write-Host "[Pipeline] Closing Deadlock..."
    $running | Stop-Process -Force

    for ($i = 0; $i -lt 50; $i++) {
        Start-Sleep -Milliseconds 100
        if (-not (Get-Process -Name "deadlock" -ErrorAction SilentlyContinue)) {
            Write-Host "[Pipeline] Deadlock closed."
            return
        }
    }

    throw "Deadlock process did not exit in time."
}

function Assert-DeadlockClosed {
    $running = Get-Process -Name "deadlock" -ErrorAction SilentlyContinue
    if ($running) {
        throw "Deadlock is still running. Cannot continue compile/pack steps while game is open."
    }
}

function Invoke-ExternalTool {
    param(
        [string]$ExePath,
        [string[]]$Arguments
    )

    & $ExePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $ExePath $($Arguments -join ' ')"
    }
}

function Get-LatestDeadlockDump {
    param([string]$ExePath)

    $dumpRoot = Split-Path -Path $ExePath -Parent
    $latest = Get-ChildItem -LiteralPath $dumpRoot -File -Filter "deadlock_*.mdmp" -ErrorAction SilentlyContinue |
        Sort-Object -Property LastWriteTime -Descending |
        Select-Object -First 1
    return $latest
}

function Start-DeadlockAndVerify {
    param(
        [string]$ExePath,
        [string[]]$Arguments,
        [string]$SteamExePath,
        [string]$SteamAppId
    )

    $beforeDump = Get-LatestDeadlockDump -ExePath $ExePath
    $beforeDumpTime = if ($beforeDump) { $beforeDump.LastWriteTime } else { [datetime]::MinValue }
    $workingDir = Split-Path -Path $ExePath -Parent

    function Wait-DeadlockByPid {
        param(
            [int]$ProcessId,
            [int]$TimeoutMs = 12000
        )
        $start = Get-Date
        while (((Get-Date) - $start).TotalMilliseconds -lt $TimeoutMs) {
            $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
            if ($proc) { return $proc }
            Start-Sleep -Milliseconds 250
        }
        return $null
    }

    function Wait-AnyDeadlock {
        param([int]$TimeoutMs = 18000)
        $start = Get-Date
        while (((Get-Date) - $start).TotalMilliseconds -lt $TimeoutMs) {
            $running = Get-Process -Name "deadlock" -ErrorAction SilentlyContinue
            if ($running) { return ($running | Select-Object -First 1) }
            Start-Sleep -Milliseconds 250
        }
        return $null
    }

    # Attempt 1: direct exe launch with explicit working directory.
    try {
        $launched = Start-Process -FilePath $ExePath -ArgumentList $Arguments -WorkingDirectory $workingDir -PassThru
    } catch {
        $launched = $null
    }

    if ($launched) {
        $byPid = Wait-DeadlockByPid -ProcessId $launched.Id -TimeoutMs 10000
        if ($byPid) {
            Write-Host "[Pipeline] Deadlock process started (PID: $($byPid.Id))."
            return
        }
    }

    $afterDump = Get-LatestDeadlockDump -ExePath $ExePath
    if ($afterDump -and $afterDump.LastWriteTime -gt $beforeDumpTime) {
        throw "Deadlock exited immediately after launch. New crash dump: $($afterDump.FullName)"
    }

    # Attempt 2: Steam -applaunch.
    if ($SteamExePath -and $SteamAppId -and (Test-Path -LiteralPath $SteamExePath)) {
        Write-Host "[Pipeline] Direct launch did not stay running. Retrying via Steam (-applaunch $SteamAppId)..."
        Start-Process -FilePath $SteamExePath -ArgumentList @("-applaunch", $SteamAppId, "-dev") -WorkingDirectory (Split-Path -Path $SteamExePath -Parent) | Out-Null
        $steamProc = Wait-AnyDeadlock -TimeoutMs 25000
        if ($steamProc) {
            Write-Host "[Pipeline] Deadlock process started via Steam (PID: $($steamProc.Id))."
            return
        }

        # Attempt 3: Steam URI fallback.
        Write-Host "[Pipeline] Steam -applaunch did not start Deadlock. Retrying via steam:// URI..."
        Start-Process ("steam://run/" + $SteamAppId + "//-dev")
        $uriProc = Wait-AnyDeadlock -TimeoutMs 25000
        if ($uriProc) {
            Write-Host "[Pipeline] Deadlock process started via Steam URI (PID: $($uriProc.Id))."
            return
        }
    }

    # Attempt 4: direct exe retry without args.
    Write-Host "[Pipeline] Retrying direct launch without extra args..."
    try {
        $plainLaunch = Start-Process -FilePath $ExePath -WorkingDirectory $workingDir -PassThru
    } catch {
        $plainLaunch = $null
    }
    if ($plainLaunch) {
        $plainProc = Wait-DeadlockByPid -ProcessId $plainLaunch.Id -TimeoutMs 12000
        if ($plainProc) {
            Write-Host "[Pipeline] Deadlock process started (plain launch, PID: $($plainProc.Id))."
            return
        }
    }

    throw "Deadlock failed to start after direct and Steam fallback attempts."
}

function Invoke-PackerWithAutoConfirm {
    param(
        [string]$ExePath,
        [string]$SourcePath,
        [string]$OutputPath
    )

    # CSDKCfgVPK shows a modal confirmation dialog on some systems.
    # Keep direct invocation (most reliable for this exe), and run a helper job
    # that attempts to focus/confirm any matching popup until packing completes.
    $autoConfirmJob = Start-Job -ScriptBlock {
        $titles = @(
            "CSDKCfgVPK",
            "CSDKCfgVPK.exe",
            "Project8CfgTool2",
            "Project8CfgVPK",
            "Success"
        )
        $processNames = @(
            "CSDKCfgVPK",
            "Project8CfgTool2"
        )
        $wshell = $null
        try {
            $wshell = New-Object -ComObject WScript.Shell
        }
        catch {
            return
        }

        while ($true) {
            $packerRunning = $false
            foreach ($pn in $processNames) {
                if (Get-Process -Name $pn -ErrorAction SilentlyContinue) {
                    $packerRunning = $true
                    break
                }
            }

            foreach ($title in $titles) {
                if (($title -eq "Success") -and (-not $packerRunning)) {
                    # Still try occasionally: some toolchains leave a trailing
                    # "Success" dialog after the main process exits.
                }
                try {
                    if ($wshell.AppActivate($title)) {
                        Start-Sleep -Milliseconds 25
                        $wshell.SendKeys("~")
                    }
                }
                catch {}
            }
            Start-Sleep -Milliseconds 120
        }
    }

    try {
        Invoke-ExternalTool -ExePath $ExePath -Arguments @($SourcePath, $OutputPath)
    }
    finally {
        # Keep auto-dismiss alive a bit longer for trailing "Success" popups.
        Start-Sleep -Milliseconds 900
        if ($autoConfirmJob) {
            try { Stop-Job -Job $autoConfirmJob -Force -ErrorAction SilentlyContinue } catch {}
            try { Remove-Job -Job $autoConfirmJob -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}

function Get-VersionFromSettings {
    param([string]$SettingsPath)

    $content = Get-Content -LiteralPath $SettingsPath -Raw
    if ($content -match "const\s+MOD_DISPLAY_VERSION\s*=\s*(?:[\s\S]*?)`"\b([0-9]+\.[0-9]+\.[0-9]+)\b`"") {
        return [string]$Matches[1]
    }
    if ($content -match "const\s+MOD_VERSION\s*=\s*(\d+)\s*;") {
        return [string]$Matches[1]
    }

    throw "Could not parse mod version from: $SettingsPath"
}

function Invoke-NodeScript {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments
    )

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw "node.exe not found in PATH; cannot run schema parity guard."
    }

    & $nodeCmd.Source $ScriptPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Node script failed ($LASTEXITCODE): $ScriptPath"
    }
}

function Invoke-PanoramaJsMinify {
    param(
        [string]$ScriptPath,
        [string]$TargetFile
    )

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw "node.exe not found in PATH; cannot run JS minify step."
    }

    $output = & $nodeCmd.Source $ScriptPath $TargetFile
    if ($LASTEXITCODE -ne 0) {
        throw "Panorama JS minify failed ($LASTEXITCODE): $TargetFile"
    }

    if (-not $output) {
        throw "Panorama JS minify produced no output for: $TargetFile"
    }

    $jsonLine = ($output | Select-Object -Last 1)
    $result = $null
    try {
        $result = $jsonLine | ConvertFrom-Json
    }
    catch {
        throw "Panorama JS minify returned invalid JSON for: $TargetFile"
    }

    return $result
}

function Format-ArchiveVersion {
    param([string]$Version)

    $trimmed = ($Version -as [string]).Trim()
    if ($trimmed -match "^\d+\.\d+\.\d+$") {
        return ($trimmed -replace "\.", "_")
    }
    if ($trimmed -match "^\d+$") {
        return $trimmed
    }
    if ($trimmed -match "^\d+_\d+_\d+$") {
        return $trimmed
    }
    return $trimmed -replace "[^0-9A-Za-z_.-]", "_"
}

function Get-NextArchiveIndex {
    param(
        [string]$LogRoot,
        [string]$ArchiveVersion
    )

    Ensure-Directory -Path $LogRoot
    $escapedVersion = [regex]::Escape($ArchiveVersion)
    $patterns = @(
        "^qol_${escapedVersion}_build_(\d+)\.pak$",
        "^qol_${escapedVersion}_qol_${escapedVersion}_build_(\d+)\.pak$"
    )
    $max = 0
    $files = Get-ChildItem -LiteralPath $LogRoot -File -Filter "qol_*_build_*.pak" -ErrorAction SilentlyContinue

    foreach ($file in $files) {
        foreach ($pattern in $patterns) {
            if ($file.Name -match $pattern) {
                $n = [int]$Matches[1]
                if ($n -gt $max) {
                    $max = $n
                }
                break
            }
        }
    }
    return ($max + 1)
}

function Invoke-PipelineCommit {
    param(
        [string]$VersionTag,
        [int]$BuildNumber
    )

    $status = git -C $SourceRoot status --short
    if (-not $status) {
        Write-Host "[Pipeline] No tracked changes detected, skipping commit."
        return $false
    }

    $changedFiles = $status | ForEach-Object {
        if ($_ -match "^\?\?\s+(.*)$") {
            $Matches[1]
        }
        else {
            ($_ -replace "^[ MADRCU\?\!\*]{1,3}\s+", "")
        }
    }
    if (-not $changedFiles) {
        Write-Host "[Pipeline] No changed files found, skipping commit."
        return $false
    }

    $messagePath = $null
    try {
        git -C $SourceRoot add -A
        $summary = git -C $SourceRoot diff --cached --stat
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $message = @"
Build qol_$VersionTag build #$BuildNumber ($timestamp)

Changed files:
$($changedFiles -join "`n")

Diff summary:
$summary
"@
        $messagePath = Join-Path $env:TEMP ("qollock_commit_" + [guid]::NewGuid().ToString("N") + ".txt")
        Set-Content -LiteralPath $messagePath -Value $message -Encoding UTF8
        git -C $SourceRoot commit -F $messagePath | Out-Null
        Remove-Item -LiteralPath $messagePath -Force
        Write-Host "[Pipeline] Commit created for build #$BuildNumber."
        return $true
    }
    catch {
        if ($messagePath) {
            Remove-Item -LiteralPath $messagePath -Force -ErrorAction SilentlyContinue
        }
        throw "Pipeline commit failed: $($_.Exception.Message)"
    }
}
function Get-RelativePathCompat {
    param(
        [string]$BasePath,
        [string]$TargetPath
    )

    $resolvedBase = (Resolve-Path -LiteralPath $BasePath).Path
    $resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
    if (-not $resolvedBase.EndsWith("\")) {
        $resolvedBase = $resolvedBase + "\"
    }
    $baseUri = New-Object System.Uri($resolvedBase)
    $targetUri = New-Object System.Uri($resolvedTarget)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace("/", "\")
}

function Get-CompileOutputPath {
    param(
        [string]$StagedFile,
        [string]$ContentRoot,
        [string]$GameRoot
    )

    $relative = Get-RelativePathCompat -BasePath $ContentRoot -TargetPath $StagedFile
    $dir = Split-Path -Path $relative -Parent
    $name = [System.IO.Path]::GetFileNameWithoutExtension($relative)
    $ext = [System.IO.Path]::GetExtension($relative).ToLowerInvariant()

    switch ($ext) {
        ".js" { $compiledName = "$name.vjs_c" }
        ".css" { $compiledName = "$name.vcss_c" }
        ".xml" { $compiledName = "$name.vxml_c" }
        ".vsvg" { $compiledName = "$name.vsvg_c" }
        ".vtex" { $compiledName = "$name.vtex_c" }
        ".vsndevts" { $compiledName = "$name.vsndevts_c" }
        ".wav" { $compiledName = "$name.vsnd_c" }
        default { return $null }
    }

    if ([string]::IsNullOrEmpty($dir)) {
        return (Join-Path $GameRoot $compiledName)
    }
    return (Join-Path (Join-Path $GameRoot $dir) $compiledName)
}

$pipelineError = $null
$packCompleted = $false
$archiveCompleted = $false
try {
    Write-Host "[Pipeline] Validating paths..."
    Require-ExistingPath -Path $SourceRoot -Label "Source root"
    Require-ExistingPath -Path $ResourceCompiler -Label "resourcecompiler.exe"
    Require-ExistingPath -Path $Packer -Label "CSDKCfgVPK.exe"
    Require-ExistingPath -Path (Split-Path -Path $LivePakPath -Parent) -Label "Live addons directory"
    Require-ExistingPath -Path $VersionSourceFile -Label "Version source file"
    Require-ExistingPath -Path $SchemaGuardScript -Label "Schema guard script"
    Require-ExistingPath -Path $JsMinifyScript -Label "Panorama JS minify script"
    Require-ExistingPath -Path $DeadlockExe -Label "deadlock.exe"

    if (-not $ChangedFiles -or $ChangedFiles.Count -eq 0) {
        throw "ChangedFiles is required. Example: -ChangedFiles 'panorama/scripts/ql_settings.js'"
    }

    $normalizedChanged = New-Object System.Collections.Generic.List[string]
    foreach ($relativePath in $ChangedFiles) {
        $relativeClean = $relativePath.Replace("/", "\")
        if ($relativeClean.StartsWith("\")) {
            $relativeClean = $relativeClean.Substring(1)
        }
        $isRuntimeCompilePath = $false
        foreach ($prefix in $RuntimeCompilePathPrefixes) {
            if ($relativeClean.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                $isRuntimeCompilePath = $true
                break
            }
        }
        if (-not $isRuntimeCompilePath) {
            throw "Build-only path passed to pipeline: $relativeClean"
        }
        $sourceFile = Join-Path $SourceRoot $relativeClean
        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
            throw "Changed file not found in source: $relativeClean"
        }
        $normalizedChanged.Add($relativeClean)
    }

    Write-Host "[Pipeline] Preflight: Validate compact schema parity..."
    Invoke-NodeScript -ScriptPath $SchemaGuardScript

    Write-Host "[Pipeline] Step 1/8: Stop game if running..."
    Stop-DeadlockIfRunning
    Assert-DeadlockClosed

    Write-Host "[Pipeline] Step 2/8: Prepare per-file compile pipeline..."
    Clear-DirectoryContents -Path $ContentStageRoot
    Clear-DirectoryContents -Path $GameStageRoot
    Ensure-Directory -Path $FinalUnpackedRoot
    $staleCompiledArtifacts = @(
        "panorama\scripts\hero_testing_plus_plus.vjs_c",
        # Native hero-testing XML is no longer overridden; its inactive JS had no include.
        "panorama\layout\hud_hero_testing.vxml_c",
        "panorama\scripts\ql_hero_testing.vjs_c",
        # Party placement now extends the native stylesheet, without an XML override.
        "panorama\layout\citadel_party.vxml_c",
        "panorama\styles\qollock_party.vcss_c",
        # Target hints now resolve the native snippet instead of added XML classes.
        "panorama\layout\ability_hud_element_unit_target.vxml_c",
        # Shop stats use the shop's existing listener and native component layouts.
        "panorama\layout\citadel_hero_stats_armor_panel.vxml_c",
        "panorama\layout\citadel_hero_stats_tech_panel.vxml_c",
        "panorama\layout\citadel_hero_stats_weapon_panel.vxml_c",
        # Performance display is now loaded through its manifest-owned modules.
        "panorama\scripts\ql_perf_overlay.vjs_c",
        # Disabled after build 10725 changed the native leaderboard snippet contract.
        # Keeping this full-popup override causes a fatal "Unable to load snippet Hero".
        "panorama\layout\popups\citadel_popup_global_leaderboard.vxml_c",
        "panorama\scripts\ql_popup_search.vjs_c",
        "panorama\styles\leaderboard_search.vcss_c",
        # The profile page now extends Valve's current stylesheet instead of
        # overriding it with the removed Time Played/Skill Rating layout.
        "panorama\styles\citadel_db_page_profile.vcss_c",
        "scripts\validate_compact_schema.vjs_c"
    )
    foreach ($staleRelative in $staleCompiledArtifacts) {
        $stalePath = Join-Path $FinalUnpackedRoot $staleRelative
        if (Test-Path -LiteralPath $stalePath -PathType Leaf) {
            Remove-Item -LiteralPath $stalePath -Force
            Write-Host "[Pipeline] Removed stale compiled artifact: $staleRelative"
        }
    }

    Write-Host "[Pipeline] Step 3/8: Compile changed files one by one..."
    $compileExtensions = @(".xml", ".css", ".js", ".vsvg", ".vtex", ".vsndevts", ".wav")
    $totalCopied = 0
    $totalSkippedNew = 0
    $totalCompiledOutputs = 0
    $totalJsMinifySavedBytes = 0

    for ($index = 0; $index -lt $normalizedChanged.Count; $index++) {
        $relative = $normalizedChanged[$index]
        Write-Host "[Pipeline] File $($index + 1)/$($normalizedChanged.Count): $relative"

        # Clean staging per-file before compile.
        Clear-DirectoryContents -Path $ContentStageRoot
        Clear-DirectoryContents -Path $GameStageRoot

        $src = Join-Path $SourceRoot $relative
        $dst = Join-Path $ContentStageRoot $relative
        Ensure-Directory -Path (Split-Path -Path $dst -Parent)
        Copy-Item -LiteralPath $src -Destination $dst -Force

        $ext = [System.IO.Path]::GetExtension($dst).ToLowerInvariant()
        if ($compileExtensions -notcontains $ext) {
            throw "Non-compilable file passed to pipeline: $relative"
        }

        if ($ext -eq ".vtex") {
            $sourcePng = [System.IO.Path]::ChangeExtension($src, ".png")
            if (Test-Path -LiteralPath $sourcePng -PathType Leaf) {
                Copy-Item -LiteralPath $sourcePng -Destination ([System.IO.Path]::ChangeExtension($dst, ".png")) -Force
            }
        }

        $relativeNormalized = $relative.Replace("/", "\")
        if (
            $ext -eq ".js" -and
            $relativeNormalized.StartsWith("panorama\scripts\", [System.StringComparison]::OrdinalIgnoreCase) -and
            -not $relativeNormalized.EndsWith("ql_minimap_crate_data.js", [System.StringComparison]::OrdinalIgnoreCase)
        ) {
            $minifyResult = Invoke-PanoramaJsMinify -ScriptPath $JsMinifyScript -TargetFile $dst
            $savedBytes = [int]($minifyResult.savedBytes)
            $totalJsMinifySavedBytes += $savedBytes
            Write-Host ("[Pipeline] Minified JS: {0} ({1} -> {2} bytes, saved {3}, lines {4})" -f $relative, $minifyResult.originalBytes, $minifyResult.minifiedBytes, $savedBytes, $minifyResult.lineCount)
        }

        Stop-DeadlockIfRunning
        Assert-DeadlockClosed

        $compileFileList = Join-Path $env:TEMP ("qollock_pipeline_compile_" + [guid]::NewGuid().ToString("N") + ".txt")
        Set-Content -LiteralPath $compileFileList -Value @($dst) -Encoding ASCII
        try {
            Invoke-ExternalTool -ExePath $ResourceCompiler -Arguments @(
                "-filelist", $compileFileList,
                "-f",
                "-nop4"
            )
        }
        finally {
            Remove-Item -LiteralPath $compileFileList -Force -ErrorAction SilentlyContinue
        }

        $expectedOutput = Get-CompileOutputPath -StagedFile $dst -ContentRoot $ContentStageRoot -GameRoot $GameStageRoot
        if (-not $expectedOutput -or -not (Test-Path -LiteralPath $expectedOutput -PathType Leaf)) {
            throw "Expected compiled output not found for $relative"
        }

        $compiledFiles = Get-ChildItem -LiteralPath $GameStageRoot -Recurse -File -ErrorAction SilentlyContinue
        if (-not $compiledFiles) {
            throw "No compiled outputs found in stage for $relative"
        }

        $newRelativePaths = New-Object System.Collections.Generic.List[string]
        foreach ($file in $compiledFiles) {
            $outRelative = Get-RelativePathCompat -BasePath $GameStageRoot -TargetPath $file.FullName
            $dest = Join-Path $FinalUnpackedRoot $outRelative
            if (-not (Test-Path -LiteralPath $dest)) {
                $newRelativePaths.Add($outRelative)
            }
        }

        $allowNewFiles = $true
        if ($newRelativePaths.Count -gt 0 -and -not $AutoApproveNewFiles) {
            Write-Host "[Pipeline] New compiled files detected for $relative ($($newRelativePaths.Count)):"
            foreach ($rel in $newRelativePaths) {
                Write-Host "  + $rel"
            }
            try {
                $answer = Read-Host "Add these new files to $FinalUnpackedRoot ? [Y/n]"
                # Default to yes so new compiled outputs are included unless explicitly denied.
                $allowNewFiles = -not ($answer -match "^(n|no)$")
            }
            catch {
                Write-Host "[Pipeline] Could not prompt for confirmation; defaulting to include new files."
                $allowNewFiles = $true
            }
        }

        foreach ($file in $compiledFiles) {
            $outRelative = Get-RelativePathCompat -BasePath $GameStageRoot -TargetPath $file.FullName
            $dest = Join-Path $FinalUnpackedRoot $outRelative
            $isNew = -not (Test-Path -LiteralPath $dest)
            if ($isNew -and -not $allowNewFiles) {
                $totalSkippedNew++
                continue
            }

            Ensure-Directory -Path (Split-Path -Path $dest -Parent)
            Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
            $totalCopied++
            $totalCompiledOutputs++
        }

        # Clean staging after each file compile/sync before next file.
        Clear-DirectoryContents -Path $ContentStageRoot
        Clear-DirectoryContents -Path $GameStageRoot
    }

    Write-Host "[Pipeline] Step 4/8: Per-file compile/sync complete."
    Write-Host "[Pipeline] Synced compiled outputs: $totalCompiledOutputs (copied: $totalCopied, skipped new: $totalSkippedNew)"
    Write-Host "[Pipeline] Total Panorama JS minify savings: $totalJsMinifySavedBytes bytes"

    Write-Host "[Pipeline] Step 6/8: Pack final unpacked folder into pak47_dir.vpk..."
    Stop-DeadlockIfRunning
    Assert-DeadlockClosed
    Invoke-PackerWithAutoConfirm -ExePath $Packer -SourcePath $FinalUnpackedRoot -OutputPath $LivePakPath
    $packCompleted = $true

    Write-Host "[Pipeline] Step 7/8: Archive pack log copy..."
    $version = Get-VersionFromSettings -SettingsPath $VersionSourceFile
    $archiveVersion = Format-ArchiveVersion -Version $version
    $nextIndex = Get-NextArchiveIndex -LogRoot $PackLogRoot -ArchiveVersion $archiveVersion
    $archiveName = "qol_$archiveVersion" + "_build_$nextIndex.pak"
    $archivePath = Join-Path $PackLogRoot $archiveName
    Copy-Item -LiteralPath $LivePakPath -Destination $archivePath -Force
    Write-Host "[Pipeline] Archived: $archivePath"
    $archiveCompleted = $true
    Invoke-PipelineCommit -VersionTag $archiveVersion -BuildNumber $nextIndex | Out-Null
}
catch {
    $pipelineError = $_
}
finally {
    if ($NoLaunch) {
        Write-Host "[Pipeline] Step 8/8: Skipped game launch (explicit NoLaunch)."
    }
    elseif (-not $packCompleted -or -not $archiveCompleted -or $pipelineError) {
        Write-Host "[Pipeline] Step 8/8: Skipped game launch (pipeline did not complete final pack/archive)."
    }
    else {
        Write-Host "[Pipeline] Step 8/8: Launching Deadlock (-dev)..."
        try {
            Start-DeadlockAndVerify -ExePath $DeadlockExe -Arguments @("-dev") -SteamExePath $SteamExe -SteamAppId $DeadlockAppId
        }
        catch {
            if ($pipelineError) {
                Write-Host "[Pipeline] Launch failed after earlier pipeline failure: $($_.Exception.Message)"
            }
            else {
                throw
            }
        }
    }
}

if ($pipelineError) {
    throw $pipelineError
}

Write-Host "[Pipeline] Done."
