[CmdletBinding()]
param(
    [string]$ModFolderName,
    [switch]$Force,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArguments
)

# PowerShell accepts -Force natively, but treats GNU-style --force as a
# positional argument. Normalize both forms so the .bat and direct PowerShell
# workflows behave the same way.
if ($ModFolderName -match '^--(?:force|f)$') {
    $Force = $true
    $ModFolderName = $null
}
foreach ($argument in $RemainingArguments) {
    if ($argument -match '^--(?:force|f)$') {
        $Force = $true
    } elseif (-not [string]::IsNullOrWhiteSpace($argument)) {
        throw "Unknown build argument: $argument"
    }
}

[console]::TreatControlCAsInput = $false
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Deadlock Mod Compiler"

$ScriptDir = (Resolve-Path "$PSScriptRoot").Path
$RepoRoot = (Resolve-Path "$ScriptDir\..").Path

# Self-build mode: when this script lives in any folder other than "tools"
# (i.e. a "build_mod" folder dropped inside a single mod), skip the mod-picker
# entirely and always compile the mod that contains this folder. The parent of
# the script folder IS the mod; its parent is the repo root used by the rest of
# the pipeline ($ModSourcePath = Join-Path $RepoRoot $SelectedMod).
$SelfBuildMode = (Split-Path $ScriptDir -Leaf) -ine 'tools'
$ForcedMod = $null
if ($SelfBuildMode) {
    $ModRoot   = Split-Path $ScriptDir -Parent
    $RepoRoot  = Split-Path $ModRoot   -Parent
    $ForcedMod = Split-Path $ModRoot   -Leaf
}

$DataDir = Join-Path $ScriptDir "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }

$BuildsDir = Join-Path $ScriptDir "builds"
$RegistryPath = Join-Path $DataDir "mod_registry.json"
$ConfigPath = Join-Path $DataDir "config.json"
$CachePath = Join-Path $DataDir "build_cache.json"

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================
function Wait-KeyPressAndExit {
    Write-Host "`nPress ANY KEY to exit..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

function Get-ModRegistry {
    if (Test-Path $RegistryPath) {
        try {
            $jsonObj = Get-Content $RegistryPath -Raw | ConvertFrom-Json
            $hash = @{}
            $jsonObj.psobject.properties | ForEach-Object { $hash[$_.Name] = $_.Value }
            return $hash
        } catch { return @{} }
    }
    return @{}
}

function Save-ModRegistry ($RegistryMap) {
    $RegistryMap | ConvertTo-Json -Depth 2 | Set-Content $RegistryPath -Encoding UTF8
}

function Get-NextPakName ($TargetDir, $RegistryMap) {
    $maxNum = 0
    $existingPaks = Get-ChildItem -Path $TargetDir -Filter "pak*_dir.vpk" -File -ErrorAction SilentlyContinue
    foreach ($pak in $existingPaks) {
        if ($pak.Name -match "^pak(\d+)_dir\.vpk$") {
            $num = [int]$matches[1]
            if ($num -gt $maxNum) { $maxNum = $num }
        }
    }
    if ($RegistryMap -and $RegistryMap.Count -gt 0) {
        foreach ($val in $RegistryMap.Values) {
            if ($val -match "^pak(\d+)_dir\.vpk$") {
                $num = [int]$matches[1]
                if ($num -gt $maxNum) { $maxNum = $num }
            }
        }
    }
    return "pak{0:D2}_dir.vpk" -f ($maxNum + 1)
}

function Kill-Deadlock {
    $process = Get-Process -Name "project8" -ErrorAction SilentlyContinue
    if (-not $process) { $process = Get-Process -Name "deadlock" -ErrorAction SilentlyContinue }
    if ($process) {
        Write-Host "Closing Deadlock..." -ForegroundColor Yellow
        Stop-Process -InputObject $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3 
    }
}

function Start-Deadlock {
    Write-Host "Starting Deadlock..." -ForegroundColor Cyan
    Start-Process "steam://run/1422450"
}

function Show-SettingsMenu {
    param([psobject]$ConfigObject)

    while ($true) {
        Clear-Host
        Write-Host "=== Build Tool Settings ===" -ForegroundColor Cyan
        Write-Host "[1] Build destination: $($ConfigObject.BuildDestination)"
        Write-Host "[2] Execution mode:    $($ConfigObject.ExecutionMode)"
        Write-Host "[3] Steam path:        $($ConfigObject.SteamPath)"
        Write-Host "[4] CSDK path:         $($ConfigObject.CsdkPath)"
        Write-Host "[5] Wipe CSDK citadel_addons folders (game + content)" -ForegroundColor Yellow
        Write-Host "[0] Back"

        $choice = Read-Host "Select setting"
        switch ($choice) {
            '1' {
                if ($ConfigObject.BuildDestination -eq 'Ask') { $ConfigObject.BuildDestination = 'Builds' }
                elseif ($ConfigObject.BuildDestination -eq 'Builds') { $ConfigObject.BuildDestination = 'Addons' }
                else { $ConfigObject.BuildDestination = 'Ask' }
            }
            '2' {
                if ($ConfigObject.ExecutionMode -eq 'BuildOnly') { $ConfigObject.ExecutionMode = 'BuildAndRestart' }
                else { $ConfigObject.ExecutionMode = 'BuildOnly' }
            }
            '3' {
                $ConfigObject.SteamPath = Read-Host "Enter Steam path"
            }
            '4' {
                $ConfigObject.CsdkPath = Read-Host "Enter CSDK path"
            }
            '5' {
                # Fully wipe the CSDK staging trees so the next build starts clean.
                # Re-resolve from the current config in case the path was just edited.
                $null = Resolve-BuildPaths
                $csdk = $script:CsdkRoot
                $targets = @(
                    (Join-Path $csdk "content\citadel_addons"),
                    (Join-Path $csdk "game\citadel_addons")
                )

                Write-Host "`nThis will permanently delete:" -ForegroundColor Yellow
                foreach ($t in $targets) { Write-Host "  $t" }
                $confirm = Read-Host "Type Y to confirm"
                if ($confirm.Trim().ToUpperInvariant() -eq 'Y') {
                    foreach ($t in $targets) {
                        if (Test-Path $t) {
                            try {
                                Get-ChildItem -Path $t -Force -ErrorAction Stop | Remove-Item -Recurse -Force -ErrorAction Stop
                                Write-Host "  Cleared: $t" -ForegroundColor Green
                            } catch {
                                Write-Host "  Failed to clear $t : $($_.Exception.Message)" -ForegroundColor Red
                            }
                        } else {
                            Write-Host "  Not found (skipped): $t" -ForegroundColor DarkGray
                        }
                    }

                    # The build cache tracks files staged in those trees; invalidate
                    # it so the next build re-stages everything instead of assuming
                    # the now-deleted artifacts are still present.
                    if (Test-Path $CachePath) {
                        Remove-Item -Path $CachePath -Force -ErrorAction SilentlyContinue
                        Write-Host "  Build cache reset." -ForegroundColor Green
                    }
                } else {
                    Write-Host "  Cancelled." -ForegroundColor DarkGray
                }
                Write-Host "Press any key to continue..." -ForegroundColor Cyan
                $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            }
            '0' {
                $ConfigObject | ConvertTo-Json -Depth 2 | Set-Content $ConfigPath -Encoding UTF8
                return
            }
        }
    }
}

function Get-CompileKeyForFile($FileInfo) {
    return (Get-FileHash -Path $FileInfo.FullName -Algorithm MD5).Hash
}

function Get-CompiledOutputPath($BaseDir, $RelativePath, $CompiledExtension) {
    $compiledPath = [System.IO.Path]::ChangeExtension($RelativePath, $CompiledExtension.TrimStart('.'))
    return Join-Path $BaseDir $compiledPath
}

# Generates a minimal .vtex descriptor for a bare image. This lets image files
# remain the source of truth: resourcecompiler still receives a .vtex and emits
# the *_png.vtex_c target Panorama expects, without hand-authored descriptors.
function Get-AutoVtexBody($RelFileName) {
    return @"
<!-- dmx encoding keyvalues2_noids 1 format vtex 1 -->
"CDmeVtex"
{
    "m_inputTextureArray" "element_array"
    [
        "CDmeInputTexture"
        {
            "m_name" "string" "InputTexture0"
            "m_fileName" "string" "$RelFileName"
            "m_colorSpace" "string" "srgb"
            "m_typeString" "string" "2D"
            "m_imageProcessorArray" "element_array"
            [
                "CDmeImageProcessor"
                {
                    "m_algorithm" "string" ""
                    "m_stringArg" "string" ""
                    "m_vFloat4Arg" "vector4" "0 0 0 0"
                }
            ]
        }
    ]
    "m_outputTypeString" "string" "2D"
    "m_outputFormat" "string" "BGRA8888"
    "m_outputClearColor" "vector4" "0 0 0 0"
    "m_nOutputMinDimension" "int" "0"
    "m_nOutputMaxDimension" "int" "0"
    "m_textureOutputChannelArray" "element_array"
    [
        "CDmeTextureOutputChannel"
        {
            "m_inputTextureArray" "string_array" [ "InputTexture0" ]
            "m_srcChannels" "string" "rgba"
            "m_dstChannels" "string" "rgba"
            "m_mipAlgorithm" "CDmeImageProcessor"
            {
                "m_algorithm" "string" ""
                "m_stringArg" "string" ""
                "m_vFloat4Arg" "vector4" "0 0 0 0"
            }
            "m_outputColorSpace" "string" "srgb"
        }
    ]
    "m_vClamp" "vector3" "0 0 0"
    "m_bNoLod" "bool" "0"
}
"@
}

# Parses a raw menu entry like "6 --force", "6 f" or "6 -f" into the command
# token plus the per-run Force flag. The flag is accepted with or without a
# leading '-'/'/' and in both long and short form (force/f), so the same tag
# that works as a launch parameter also works when typed at the interactive
# prompt. A forced run does a full clean rebuild of the mod (see -Force handling
# below); for a global wipe of every mod use Settings [5].
function Parse-RunFlags {
    param([string]$InputText)

    $force = $false
    $rest  = New-Object System.Collections.Generic.List[string]

    foreach ($tok in ($InputText -split '\s+')) {
        if ([string]::IsNullOrWhiteSpace($tok)) { continue }
        $norm = $tok.TrimStart('-', '/').ToLowerInvariant()
        switch ($norm) {
            'force'     { $force = $true }
            'f'         { $force = $true }
            default     { $rest.Add($tok) }
        }
    }

    return [pscustomobject]@{
        Force   = $force
        Command = ($rest -join ' ').Trim()
    }
}

# Invokes a native executable safely. Under PowerShell 5.1 with
# $ErrorActionPreference = 'Stop', any line a native tool writes to stderr (even
# harmless banners) is promoted to a terminating NativeCommandError, which would
# abort the build mid-step. We drop to 'Continue' for the call and judge success
# solely by the process exit code.
function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEAP
    }
    return [pscustomobject]@{ Output = $output; ExitCode = $code }
}

# Resolves Steam / addons / CSDK locations from the current $Config into
# script-scoped variables. Returns $true only when both the compiler and packer
# executables exist, so callers can keep the UI reachable instead of hard-exiting
# (which previously made the in-app "fix CSDK path" Settings flow impossible).
function Resolve-BuildPaths {
    $resolvedSteam = $Config.SteamPath
    if ([string]::IsNullOrWhiteSpace($resolvedSteam) -or -not (Test-Path $resolvedSteam)) {
        $resolvedSteam = "C:\Program Files (x86)\Steam"
        try {
            $RegSteam = Get-ItemPropertyValue -Path "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam" -Name "InstallPath" -ErrorAction Stop
            if (Test-Path $RegSteam) { $resolvedSteam = $RegSteam }
        } catch { }
    }
    $script:SteamPath = $resolvedSteam

    $PotentialLibs = @($resolvedSteam)
    $VdfPath = Join-Path $resolvedSteam "steamapps\libraryfolders.vdf"
    if (Test-Path $VdfPath) {
        $VdfContent = Get-Content $VdfPath -Raw
        $VdfMatches = [regex]::Matches($VdfContent, '"path"\s+"([^"]+)"')
        foreach ($m in $VdfMatches) {
            $PotentialLibs += $m.Groups[1].Value.Replace("\\", "\")
        }
    }

    $resolvedAddons = $null
    foreach ($lib in $PotentialLibs) {
        $DeadlockBase = Join-Path $lib "steamapps\common\Deadlock"
        if (Test-Path $DeadlockBase) {
            $resolvedAddons = Join-Path $DeadlockBase "game\citadel\addons"
            if (-not (Test-Path $resolvedAddons)) { New-Item -ItemType Directory -Force -Path $resolvedAddons | Out-Null }
            break
        }
    }
    if ($null -eq $resolvedAddons) {
        $resolvedAddons = Join-Path $resolvedSteam "steamapps\common\Deadlock\game\citadel\addons"
    }
    $script:AddonsDir = $resolvedAddons

    $resolvedCsdk = $Config.CsdkPath
    if (-not (Test-Path (Join-Path $resolvedCsdk "game\bin_cs2\win64\resourcecompiler.exe"))) {
        $NestedRoot = Join-Path $resolvedCsdk "Reduced_CSDK_12"
        if (Test-Path (Join-Path $NestedRoot "game\bin_cs2\win64\resourcecompiler.exe")) {
            $resolvedCsdk = $NestedRoot
        }
    }
    $script:CsdkRoot = $resolvedCsdk
    $script:Compiler = Join-Path $resolvedCsdk "game\bin_cs2\win64\resourcecompiler.exe"
    $script:Packer   = Join-Path $resolvedCsdk "game\bin\win64\CSDKCfgVPK.exe"

    return ((Test-Path $script:Compiler) -and (Test-Path $script:Packer))
}

# ==============================================================================
# CONFIGURATION MANAGEMENT
# ==============================================================================
$DefaultConfig = [ordered]@{
    BuildDestination = "Ask"
    ExecutionMode    = "BuildOnly"
    SteamPath        = ""
    CsdkPath         = "C:\Reduced_CSDK_12"
}

if (-not (Test-Path $ConfigPath)) {
    $DefaultConfig | ConvertTo-Json -Depth 2 | Set-Content $ConfigPath -Encoding UTF8
    $Config = $DefaultConfig
    Write-Host "Created default config.json" -ForegroundColor DarkGray
} else {
    try {
        $Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        $configUpdated = $false
        foreach ($key in $DefaultConfig.Keys) {
            if ($null -eq $Config.$key) {
                $Config | Add-Member -MemberType NoteProperty -Name $key -Value $DefaultConfig[$key]
                $configUpdated = $true
            }
        }
        if ($configUpdated) { $Config | ConvertTo-Json -Depth 2 | Set-Content $ConfigPath -Encoding UTF8 }
    } catch {
        Write-Host "ERROR: config.json is corrupted. Using defaults." -ForegroundColor Red
        $Config = $DefaultConfig
    }
}

# ==============================================================================
# PATH RESOLUTION
# ==============================================================================
if (-not (Resolve-BuildPaths)) {
    Write-Host "WARNING: CSDK compiler/packer not found at '$CsdkRoot'." -ForegroundColor Yellow
    Write-Host "Open Settings ([0] in the menu) to set a valid CSDK path, or edit data\config.json." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

# ==============================================================================
# MAIN LOOP
# ==============================================================================
$InitialMod = $ModFolderName

while ($true) {
    Clear-Host
    Write-Host "=== Deadlock Mod Compiler (Incremental Build) ===" -ForegroundColor Cyan
    Write-Host "Tip: add '--force' (or '-f') after a menu number for a full clean rebuild, e.g. '2 -f'.`n" -ForegroundColor DarkGray
    
    $SelectedMod = $InitialMod

    if ($SelfBuildMode) {
        $SelectedMod = $ForcedMod
        Write-Host "Self-build mode: compiling '$SelectedMod' (folder containing this script).`n" -ForegroundColor White
    }

    if (-not $SelfBuildMode -and [string]::IsNullOrWhiteSpace($SelectedMod)) {
        Write-Host "Available mods to build:" -ForegroundColor White
        
        $folders = Get-ChildItem -Path $RepoRoot -Directory | Where-Object { 
            $_.Name -notmatch "^\." -and 
            $_.Name -notin @("tools", "builds") 
        }

        if ($folders.Count -eq 0) {
            Write-Host "ERROR: No valid mod folders found in $RepoRoot." -ForegroundColor Red
            Wait-KeyPressAndExit
        }

        Write-Host "[0] Settings"
        for ($i = 0; $i -lt $folders.Count; $i++) {
            Write-Host "[$($i + 1)] $($folders[$i].Name)"
        }
        Write-Host "[S] Start Deadlock"
        Write-Host "[R] Restart Deadlock"

        $validSelection = $false
        while (-not $validSelection) {
            $rawSelection = Read-Host "Enter the number of the mod to compile"

            # Strip and apply the per-run Force flag (--force/-f) typed alongside
            # the menu choice, e.g. "6 --force" or "6 f".
            $parsedRun = Parse-RunFlags -InputText $rawSelection
            $Force = $parsedRun.Force
            $selection = $parsedRun.Command

            switch ($selection.ToUpperInvariant()) {
                '0' {
                    Show-SettingsMenu -ConfigObject $Config
                    $null = Resolve-BuildPaths
                    $validSelection = $false
                    Clear-Host
                    Write-Host "Available mods to build:" -ForegroundColor White
                    Write-Host "[0] Settings"
                    for ($j = 0; $j -lt $folders.Count; $j++) {
                        Write-Host "[$($j + 1)] $($folders[$j].Name)"
                    }
                    Write-Host "[S] Start Deadlock"
                    Write-Host "[R] Restart Deadlock"
                    continue
                }
                'S' {
                    Start-Deadlock
                    Start-Sleep -Seconds 1
                    continue
                }
                'R' {
                    Kill-Deadlock
                    Start-Deadlock
                    Start-Sleep -Seconds 1
                    continue
                }
                default {
                    $parsed = 0
                    if ([int]::TryParse($selection, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le $folders.Count) {
                        $SelectedMod = $folders[$parsed - 1].Name
                        $validSelection = $true
                    }
                }
            }
        }
    }

    $InitialMod = $null
    $ModSourcePath = Join-Path $RepoRoot $SelectedMod

    if (-not (Test-Path $ModSourcePath)) {
        Write-Host "ERROR: Mod folder '$SelectedMod' not found." -ForegroundColor Red
        Wait-KeyPressAndExit
    }

    $BuildMode = 0
    if ($Config.ExecutionMode -eq "BuildAndRestart") {
        $BuildMode = 2
    } else {
        if ($Config.BuildDestination -eq "Builds") { $BuildMode = 1 } 
        elseif ($Config.BuildDestination -eq "Addons") { $BuildMode = 2 } 
        else {
            Write-Host "`nSelect build destination:" -ForegroundColor Cyan
            Write-Host "[1] Local (build_mod/builds/$SelectedMod.vpk)"
            Write-Host "[2] Game Addons Folder ($AddonsDir)"
            Write-Host "[0] Settings"
            Write-Host "[S] Start Deadlock"
            Write-Host "[R] Restart Deadlock"
            while ($BuildMode -notin @(1, 2)) {
                $parsedRun = Parse-RunFlags -InputText (Read-Host "Enter 1, 2, 0, S, or R")
                $selection = $parsedRun.Command.ToUpperInvariant()
                switch ($selection) {
                    '0' {
                        Show-SettingsMenu -ConfigObject $Config
                        $null = Resolve-BuildPaths
                    }
                    'S' { Start-Deadlock }
                    'R' {
                        Kill-Deadlock
                        Start-Deadlock
                    }
                    '1' {
                        $Force = $Force -or $parsedRun.Force
                        $BuildMode = 1
                    }
                    '2' {
                        $Force = $Force -or $parsedRun.Force
                        $BuildMode = 2
                    }
                }
            }
        }
    }

    $OutputVpk = ""
    if ($BuildMode -eq 1) {
        if (Test-Path $BuildsDir -PathType Leaf) { Remove-Item $BuildsDir -Force }
        if (-not (Test-Path $BuildsDir)) { New-Item -ItemType Directory -Force -Path $BuildsDir | Out-Null }
        $OutputVpk = Join-Path $BuildsDir "$SelectedMod.vpk"
    } else {
        if (-not (Test-Path $AddonsDir)) {
            Write-Host "ERROR: Addons directory not found: $AddonsDir" -ForegroundColor Red
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            continue
        }
        $Registry = Get-ModRegistry
        $AssignedPak = $Registry[$SelectedMod]
        if ($AssignedPak -and (Test-Path (Join-Path $AddonsDir $AssignedPak))) {
            $OutputVpk = Join-Path $AddonsDir $AssignedPak
        } else {
            $AssignedPak = Get-NextPakName -TargetDir $AddonsDir -RegistryMap $Registry
            $Registry[$SelectedMod] = $AssignedPak
            Save-ModRegistry -RegistryMap $Registry
            $OutputVpk = Join-Path $AddonsDir $AssignedPak
        }
    }

    Write-Host "`n=== Starting build process for: $SelectedMod ===" -ForegroundColor Green
    Write-Host "Destination: $OutputVpk" -ForegroundColor DarkGray

    $TempContent = Join-Path $CsdkRoot "content\citadel_addons\build_$SelectedMod"
    $TempGame    = Join-Path $CsdkRoot "game\citadel_addons\build_$SelectedMod"

    try {
        if (-not (Test-Path $Compiler) -or -not (Test-Path $Packer)) {
            throw "CSDK compiler/packer not found at '$CsdkRoot'. Open Settings ([0]) to set a valid CSDK path."
        }

        if ($Config.ExecutionMode -eq "BuildAndRestart") { Kill-Deadlock }

        # A forced run is a full clean rebuild of this mod: wipe its temp build
        # folders first so nothing stale survives (orphaned artifacts from a
        # failed build, renamed extensions, etc.). The hashing pass below then
        # re-stages and recompiles every source file from scratch.
        if ($Force) {
            Write-Host "Cleaning temp build folders for this mod..." -ForegroundColor Yellow
            if (Test-Path $TempContent) { Remove-Item -Path $TempContent -Recurse -Force }
            if (Test-Path $TempGame) { Remove-Item -Path $TempGame -Recurse -Force }
        }

        $BuildCache = @{}
        if (Test-Path $CachePath) {
            try {
                $json = Get-Content $CachePath -Raw | ConvertFrom-Json
                $json.psobject.properties | ForEach-Object { $BuildCache[$_.Name] = $_.Value }
            } catch {}
        }

        if (-not (Test-Path $TempContent)) { New-Item -ItemType Directory -Force -Path $TempContent | Out-Null }
        if (-not (Test-Path $TempGame)) { New-Item -ItemType Directory -Force -Path $TempGame | Out-Null }

        Write-Host "Step 1/3: Checking for modified files (Hashing)..." -ForegroundColor Cyan
        if ($Force) {
            Write-Host "  Force rebuild enabled for this run." -ForegroundColor Yellow
        }
        
        # Skip dot-directories/dotfiles (.git, .claude, .vs, ...) so editor/tooling
        # metadata never pollutes the cache or gets packed into the mod.
        # Skip dot-directories/dotfiles (.git, .claude, .vs, ...) and a root-level
        # "build_mod" folder (this self-build tool dropped inside the mod) so its
        # script/data/builds/VPK never get packed into the mod itself. The
        # build_mod exclusion applies in both modes — the tools-based build of the
        # same mod must skip it too.
        # Build only actual Source 2 content roots. This prevents tooling,
        # node_modules and repository metadata from being compiled or packed.
        # QOLLOCK's root-level scripts folder is development tooling, not game
        # content; its runtime scripts are all under panorama/.
        $ContentRoots = @('panorama', 'soundevents', 'sounds')
        $SourceFiles = Get-ChildItem -Path $ModSourcePath -Recurse -File | Where-Object {
            $rel = $_.FullName.Substring($ModSourcePath.Length + 1)
            $segs = $rel -split '[\\/]'
            if ($segs | Where-Object { $_.StartsWith('.') }) { return $false }
            return ($ContentRoots -contains $segs[0].ToLowerInvariant())
        }
        $CurrentFiles = @{}
        $FilesToCompile = New-Object System.Collections.Generic.List[string]
        
        $Utf8NoBom = New-Object System.Text.UTF8Encoding $false
        $AllowedExts = @('.xml', '.css', '.js', '.vsndevts', '.wav', '.vtex', '.vdata', '.vsvg', '.svg', '.vpcf', '.vmdl', '.vmat')
        $CompileOutputs = @{
            '.xml'      = '.vxml_c'
            '.css'      = '.vcss_c'
            '.js'       = '.vjs_c'
            '.vsndevts' = '.vsndevts_c'
            '.wav'      = '.vsnd_c'
            '.vtex'     = '.vtex_c'
            '.vdata'    = '.vdata_c'
            '.vsvg'     = '.vsvg_c'
            '.svg'      = '.vsvg_c'
            '.vpcf'     = '.vpcf_c'
            '.vmdl'     = '.vmdl_c'
            '.vmat'     = '.vmat_c'
            '.png'      = '.vtex_c'
            '.tga'      = '.vtex_c'
        }
        $AutoVtexSourceExts = @('.png', '.tga')
        $StaleCompiledExts = @('.vxml_c', '.vcss_c', '.vjs_c', '.vsndevts_c', '.vsnd_c', '.vtex_c', '.vdata_c', '.vsvg_c', '.vpcf_c', '.vmdl_c', '.vmat_c')
        
        $updatedCount = 0
        $changedFiles = New-Object System.Collections.Generic.List[string]

        foreach ($file in $SourceFiles) {
            $relPath = $file.FullName.Substring($ModSourcePath.Length + 1)
            $cacheKey = "${SelectedMod}|${relPath}".ToLower()
            $CurrentFiles[$cacheKey] = $true

            $compileKey = Get-CompileKeyForFile -FileInfo $file
            $contentDest = Join-Path $TempContent $relPath
            $compiledDest = $null
            if ($CompileOutputs.ContainsKey($file.Extension)) {
                $compiledDest = Get-CompiledOutputPath -BaseDir $TempGame -RelativePath $relPath -CompiledExtension $CompileOutputs[$file.Extension]
            }

            $cachedCompileKey = $null
            if ($BuildCache.Contains($cacheKey)) {
                $cachedCompileKey = [string]$BuildCache[$cacheKey]
            }

            $hashChanged = $Force -or $null -eq $cachedCompileKey -or $cachedCompileKey.Trim() -ne $compileKey
            $contentMissing = -not (Test-Path $contentDest)
            $compiledMissing = $compiledDest -and -not (Test-Path $compiledDest)

            if ($AutoVtexSourceExts -contains $file.Extension) {
                $relDir = Split-Path $relPath
                $relBase = [System.IO.Path]::GetFileNameWithoutExtension($relPath)
                $bareCompiled = Join-Path $TempGame (Join-Path $relDir "$relBase.vtex_c")
                $compiledMissing = -not (Test-Path $bareCompiled)
            }

            $needsCopy = $hashChanged -or $contentMissing
            $needsCompile = $hashChanged -or $compiledMissing

            if ($needsCopy) {
                $dir = Split-Path $contentDest
                if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

                Copy-Item -Path $file.FullName -Destination $contentDest -Force

                if ($file.Extension -eq '.vtex') {
                    $content = [System.IO.File]::ReadAllText($contentDest)
                    if ($content -match '"m_algorithm"\s+"string"') {
                        $content = $content -replace '("m_algorithm"\s+"string"\s+)"[^"]+"', '$1""'
                        [System.IO.File]::WriteAllText($contentDest, $content, $Utf8NoBom)
                    }
                }
            }

            # Fonts are consumed directly, not compiled by resourcecompiler.
            # Restore missing staged fonts even when their source hash is cached.
            if ($file.Extension -ieq '.ttf') {
                $fontDest = Join-Path $TempGame $relPath
                if ($hashChanged -or -not (Test-Path -LiteralPath $fontDest)) {
                    $fontDir = Split-Path $fontDest
                    if (-not (Test-Path -LiteralPath $fontDir)) {
                        New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
                    }
                    Copy-Item -LiteralPath $file.FullName -Destination $fontDest -Force
                }
            }

            if ($AllowedExts -contains $file.Extension -and ($needsCopy -or $needsCompile)) {
                $FilesToCompile.Add($contentDest)
            }

            if ($AutoVtexSourceExts -contains $file.Extension) {
                $bareVtexSourcePath = [System.IO.Path]::ChangeExtension($file.FullName, '.vtex')
                if (Test-Path $bareVtexSourcePath) {
                    if ($needsCopy -or $needsCompile) {
                        Write-Host "  Skipping bare auto-vtex for $relPath (custom .vtex present)" -ForegroundColor DarkGray
                    }
                } else {
                    $genBareVtexPath = [System.IO.Path]::ChangeExtension($contentDest, '.vtex')
                    $genBareRelPath = $genBareVtexPath.Substring($TempContent.Length + 1)

                    # Mark generated descriptors as live even on incremental runs.
                    # Otherwise the orphan sweep deletes their compiled texture.
                    $CurrentFiles["${SelectedMod}|${genBareRelPath}".ToLower()] = $true

                    if ($needsCopy -or $needsCompile) {
                        $relFileName = $relPath -replace '\\', '/'
                        $vtexBody = Get-AutoVtexBody -RelFileName $relFileName
                        [System.IO.File]::WriteAllText($genBareVtexPath, $vtexBody, $Utf8NoBom)
                        $FilesToCompile.Add($genBareVtexPath)
                    }
                }
            }

            if ($hashChanged) {
                $BuildCache[$cacheKey] = $compileKey
                $updatedCount++
                $changedFiles.Add($relPath)
            }
        }

        $KeysToRemove = New-Object System.Collections.Generic.List[string]
        $prefix = "${SelectedMod}|".ToLower()
        foreach ($key in $BuildCache.Keys) {
            if ($key.StartsWith($prefix)) {
                if (-not $CurrentFiles.Contains($key)) {
                    $KeysToRemove.Add($key)
                    $relPath = $key.Substring($prefix.Length)
                    
                    $cPath = Join-Path $TempContent $relPath
                    if (Test-Path $cPath) { Remove-Item $cPath -Recurse -Force }

                    $gPath = Join-Path $TempGame $relPath
                    if (Test-Path $gPath) { Remove-Item $gPath -Recurse -Force }

                    $sourceExt = [System.IO.Path]::GetExtension($relPath).ToLowerInvariant()
                    if ($CompileOutputs.ContainsKey($sourceExt)) {
                        $compiledPath = Get-CompiledOutputPath -BaseDir $TempGame -RelativePath $relPath -CompiledExtension $CompileOutputs[$sourceExt]
                        if (Test-Path $compiledPath) { Remove-Item $compiledPath -Recurse -Force }
                    }
                }
            }
        }
        foreach ($k in $KeysToRemove) { $BuildCache.Remove($k) }

        $TempContentFiles = @()
        if (Test-Path $TempContent) {
            $TempContentFiles = Get-ChildItem -Path $TempContent -Recurse -File
        }
        foreach ($tempFile in $TempContentFiles) {
            $tempRelPath = $tempFile.FullName.Substring($TempContent.Length + 1)
            $tempCacheKey = "${SelectedMod}|${tempRelPath}".ToLower()
            if (-not $CurrentFiles.Contains($tempCacheKey)) {
                Remove-Item -Path $tempFile.FullName -Force -ErrorAction SilentlyContinue
                $tempGameFile = Join-Path $TempGame $tempRelPath
                if (Test-Path $tempGameFile) { Remove-Item -Path $tempGameFile -Recurse -Force -ErrorAction SilentlyContinue }

                $tempSourceExt = [System.IO.Path]::GetExtension($tempRelPath).ToLowerInvariant()
                if ($CompileOutputs.ContainsKey($tempSourceExt)) {
                    $tempCompiledPath = Get-CompiledOutputPath -BaseDir $TempGame -RelativePath $tempRelPath -CompiledExtension $CompileOutputs[$tempSourceExt]
                    if (Test-Path $tempCompiledPath) { Remove-Item -Path $tempCompiledPath -Recurse -Force -ErrorAction SilentlyContinue }
                }
            }
        }

        $TempGameFiles = @()
        if (Test-Path $TempGame) {
            $TempGameFiles = Get-ChildItem -Path $TempGame -Recurse -File
        }
        foreach ($tempGameEntry in $TempGameFiles) {
            $gameRelPath = $tempGameEntry.FullName.Substring($TempGame.Length + 1)
            $sourceCandidate = Join-Path $ModSourcePath $gameRelPath
            $isCompiledArtifact = $false
            foreach ($compiledExt in $StaleCompiledExts) {
                if ($tempGameEntry.Name.EndsWith($compiledExt)) {
                    $isCompiledArtifact = $true
                    break
                }
            }

            if (-not $isCompiledArtifact -and -not (Test-Path $sourceCandidate)) {
                Remove-Item -Path $tempGameEntry.FullName -Force -ErrorAction SilentlyContinue
                $compiledSibling = $tempGameEntry.FullName + '_c'
                if (Test-Path $compiledSibling) { Remove-Item -Path $compiledSibling -Recurse -Force -ErrorAction SilentlyContinue }
            }
        }

        Write-Host "  Found $updatedCount new/modified files. Removed $($KeysToRemove.Count) deleted files." -ForegroundColor DarkGray

        if ($changedFiles.Count -gt 0) {
            Write-Host "  Changed files:" -ForegroundColor DarkGray
            foreach ($changedFile in $changedFiles) {
                Write-Host "    - $changedFile" -ForegroundColor DarkGray
            }
        }

        Write-Host "Step 2/3: Compiling assets..." -ForegroundColor Cyan
        $errorCount = 0
        $totalFiles = $FilesToCompile.Count

        if ($totalFiles -gt 0) {
            $batchSize = 25
            $batches = [math]::Ceiling($totalFiles / $batchSize)

            for ($i = 0; $i -lt $batches; $i++) {
                $batchFiles = $FilesToCompile | Select-Object -Skip ($i * $batchSize) -First $batchSize
                $statusText = "  Compiling batch $($i + 1)/$batches ($($batchFiles.Count) files)..."
                $padLength = [math]::Max(0, 80 - $statusText.Length)
                Write-Host "`r$statusText$($(" " * $padLength))" -NoNewline -ForegroundColor Yellow

                $compilerArgs = @()
                foreach ($file in $batchFiles) {
                    $compilerArgs += "-i"
                    $compilerArgs += $file
                }
                $compilerArgs += "-nop4"

                $compileResult = Invoke-NativeCommand -FilePath $Compiler -Arguments $compilerArgs

                if ($compileResult.ExitCode -ne 0) {
                    Write-Host "`n  [!] Error compiling batch $($i + 1)" -ForegroundColor Red
                    Write-Host "      Details: $($compileResult.Output)" -ForegroundColor DarkRed
                    $errorCount += $batchFiles.Count
                }
            }
            Write-Host "`n  Done compiling $totalFiles files." -ForegroundColor Green
        } else {
            Write-Host "  No files changed since last build. Skipping compilation." -ForegroundColor Green
        }

        if ($errorCount -gt 0) {
            throw "$errorCount files failed to compile. Aborting before VPK packing."
        }

        # Only persist the cache after a fully successful compile. A failed
        # source must be retried on the next run rather than silently skipped.
        $CacheObj = New-Object PSObject
        foreach ($key in $BuildCache.Keys) {
            $CacheObj | Add-Member -MemberType NoteProperty -Name $key -Value $BuildCache[$key]
        }
        $CacheObj | ConvertTo-Json -Depth 1 | Set-Content $CachePath -Encoding UTF8

        Write-Host "Step 3/3: Packing VPK..." -ForegroundColor Cyan
        if (Test-Path $OutputVpk) { Remove-Item -Path $OutputVpk -Force }

        # A 'pakNN_dir.vpk' is paired with data archives (pakNN_000.vpk, ...).
        # Remove stale ones first so a smaller rebuild can't leave orphaned data
        # chunks that still ship removed assets to the game.
        $vpkDir  = Split-Path $OutputVpk
        $vpkLeaf = Split-Path $OutputVpk -Leaf
        if ($vpkLeaf -match '^(.*)_dir\.vpk$') {
            $vpkBase = $matches[1]
            $escapedBase = [regex]::Escape($vpkBase)
            Get-ChildItem -Path $vpkDir -Filter "$vpkBase`_*.vpk" -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match "^${escapedBase}_\d{3}\.vpk$" } |
                ForEach-Object { Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue }
        }

        $packResult = Invoke-NativeCommand -FilePath $Packer -Arguments @($TempGame, $OutputVpk)
        if ($packResult.ExitCode -ne 0) {
            Write-Host $packResult.Output -ForegroundColor DarkRed
            throw "VPK Packer failed with exit code $($packResult.ExitCode)."
        }

        Write-Host "`n=== BUILD SUCCESSFUL ===" -ForegroundColor Green
        Write-Host "Output saved to: $OutputVpk" -ForegroundColor White

        if ($Config.ExecutionMode -eq "BuildAndRestart") { Start-Deadlock }
    }
    catch {
        Write-Host "`n=== BUILD FAILED ===" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        # Let scripts that invoked a specific mod observe a non-zero failure.
        if (-not [string]::IsNullOrWhiteSpace($ModFolderName)) {
            throw
        }
    }
    finally {
        Start-Sleep -Milliseconds 500 
    }

    Write-Host "`nPress ANY KEY to return to the main menu, or ESC to exit..." -ForegroundColor Cyan
    $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    if ($key.VirtualKeyCode -eq 27) { break }
}
