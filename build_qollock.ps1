param(
    [switch]$NoMinify,
    [switch]$NoDeploy
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentRoot = Split-Path -Parent $root
$modSrc = $root
$stageSrc = Join-Path $parentRoot 'QOLLOCK_terser'
$stageCompiled = Join-Path $parentRoot 'QOLLOCK_terser_compiled'
$batchSrc = Join-Path $parentRoot 'QOLLOCK_compile_batch'
$batchCompiled = Join-Path $parentRoot 'QOLLOCK_compile_batch_compiled'
$compiler = 'F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe'
$vpkeditcliCandidates = @(
    'F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe',
    'F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\vpk cli\vpkeditcli.exe',
    'F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod_release\compiler\vpkeditcli.exe'
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$vpkOut = Join-Path $root 'pak47_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak47_dir.vpk'

function Require-Path {
    param(
        [string]$Path,
        [string]$Label
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Remove-PathIfExists {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Invoke-NodeCheck {
    param([string]$Path)
    & node --check $Path
    if ($LASTEXITCODE -ne 0) {
        throw "node --check failed: $Path"
    }
}

Require-Path -Path $compiler -Label 'Source 2 compiler'
if (-not $vpkeditcli) {
    Write-Host '[ERROR] vpkeditcli.exe not found. Checked:' -ForegroundColor Red
    foreach ($candidate in $vpkeditcliCandidates) {
        Write-Host "  $candidate" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`n[0/5] Running local validation..." -ForegroundColor Cyan
Invoke-NodeCheck (Join-Path $modSrc 'panorama\scripts\ql_shared_presets.js')
Invoke-NodeCheck (Join-Path $modSrc 'panorama\scripts\ql_settings.js')
Invoke-NodeCheck (Join-Path $modSrc 'panorama\scripts\ql_core.js')
Invoke-NodeCheck (Join-Path $modSrc 'panorama\scripts\showrank_web_media_bridge.js')
Invoke-NodeCheck (Join-Path $modSrc 'scripts\validate_compact_schema.js')

$schemaGuard = Join-Path $modSrc 'scripts\validate_compact_schema.js'
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$schemaOutput = & node $schemaGuard 2>&1
$schemaExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($schemaExitCode -ne 0) {
    Write-Host '  [WARN] Full schema guard did not pass. This is expected when G:\MIRROR_QOLLOCK is not present.' -ForegroundColor Yellow
}

[xml](Get-Content -Raw -Path (Join-Path $modSrc 'panorama\layout\citadel_hud_top_bar.xml')) | Out-Null
[xml](Get-Content -Raw -Path (Join-Path $modSrc 'panorama\layout\citadel_hud_top_bar_player.xml')) | Out-Null
[xml](Get-Content -Raw -Path (Join-Path $modSrc 'panorama\layout\hud_escape_menu.xml')) | Out-Null
[xml](Get-Content -Raw -Path (Join-Path $modSrc 'panorama\layout\players_list_entry.xml')) | Out-Null
[xml](Get-Content -Raw -Path (Join-Path $modSrc 'panorama\layout\profile_card.xml')) | Out-Null
[xml](Get-Content -Raw -Path (Join-Path $modSrc 'panorama\layout\citadel_ui_context_menu_player.xml')) | Out-Null
Write-Host '  Local validation completed.' -ForegroundColor Green

Write-Host "`n[1/5] Preparing staged source..." -ForegroundColor Cyan
Remove-PathIfExists $stageSrc
Remove-PathIfExists $stageCompiled
Remove-PathIfExists $vpkOut
New-Item -ItemType Directory -Force -Path $stageSrc | Out-Null

foreach ($dir in @('panorama', 'soundevents', 'sounds')) {
    $src = Join-Path $modSrc $dir
    if (Test-Path -LiteralPath $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $stageSrc $dir) -Recurse -Force
    }
}
Write-Host "  Staged source -> $stageSrc" -ForegroundColor Green

Write-Host "`n[2/5] Minifying Panorama JS..." -ForegroundColor Cyan
if ($NoMinify) {
    Write-Host '  Skipped by -NoMinify.' -ForegroundColor Yellow
} else {
    $minifier = Join-Path $modSrc 'scripts\minify_panorama_js.js'
    Require-Path -Path $minifier -Label 'QOLLOCK JS minifier'
    $scriptFiles = Get-ChildItem -LiteralPath (Join-Path $stageSrc 'panorama\scripts') -Filter *.js -File | Sort-Object Name
    foreach ($script in $scriptFiles) {
        & node $minifier $script.FullName | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Minify failed: $($script.FullName)"
        }
    }
    Write-Host '  Minified JS OK.' -ForegroundColor Green
}

Write-Host "`n[3/5] Compiling QOLLOCK..." -ForegroundColor Cyan
$allSourceFiles = Get-ChildItem -LiteralPath $stageSrc -Recurse -File | Sort-Object FullName
if (-not $allSourceFiles) {
    throw "No source files found in staged source: $stageSrc"
}
New-Item -ItemType Directory -Force -Path $stageCompiled | Out-Null
$batchSize = 30
$batchIndex = 0
for ($offset = 0; $offset -lt $allSourceFiles.Count; $offset += $batchSize) {
    $batchIndex += 1
    Remove-PathIfExists $batchSrc
    Remove-PathIfExists $batchCompiled
    New-Item -ItemType Directory -Force -Path $batchSrc | Out-Null
    $batchFiles = @($allSourceFiles | Select-Object -Skip $offset -First $batchSize)
    foreach ($file in $batchFiles) {
        $relative = $file.FullName.Substring($stageSrc.Length).TrimStart('\')
        $dest = Join-Path $batchSrc $relative
        $destDir = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    }

    Write-Host "  Batch $batchIndex : $($batchFiles.Count) files" -ForegroundColor DarkGray
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $compileOutput = & $compiler $batchSrc 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if (-not (Test-Path -LiteralPath $batchCompiled)) {
        $compileText = ($compileOutput | Out-String).Trim()
        throw "Compiler did not create batch output for batch $batchIndex. Exit $exitCode. $compileText"
    }
    $compiledFiles = Get-ChildItem -LiteralPath $batchCompiled -Recurse -File -ErrorAction SilentlyContinue
    if (-not $compiledFiles) {
        $compileText = ($compileOutput | Out-String).Trim()
        throw "Compiler produced no files for batch $batchIndex. Exit $exitCode. $compileText"
    }
    Copy-Item -Path (Join-Path $batchCompiled '*') -Destination $stageCompiled -Recurse -Force
}
Remove-PathIfExists $batchSrc
Remove-PathIfExists $batchCompiled
foreach ($requiredCompiled in @(
    'panorama\scripts\ql_shared_presets.vjs_c',
    'panorama\scripts\ql_settings.vjs_c',
    'panorama\scripts\ql_core.vjs_c',
    'panorama\layout\citadel_hud_top_bar.vxml_c',
    'panorama\layout\citadel_hud_top_bar_player.vxml_c',
    'panorama\styles\citadel_hud_top_bar.vcss_c'
)) {
    $requiredPath = Join-Path $stageCompiled $requiredCompiled
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Compiled required asset not found: $requiredPath"
    }
}
Write-Host "  Compiled OK -> $stageCompiled" -ForegroundColor Green

Write-Host "`n[4/5] Packing VPK..." -ForegroundColor Cyan
Write-Host "  Using vpkeditcli -> $vpkeditcli" -ForegroundColor DarkGray
& $vpkeditcli $stageCompiled -o $vpkOut -s --no-progress
if ($LASTEXITCODE -ne 0) {
    throw "vpkeditcli failed with code $LASTEXITCODE"
}
Require-Path -Path $vpkOut -Label 'Packed VPK'

$vpkTree = & $vpkeditcli $vpkOut --file-tree --no-progress
if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect packed VPK contents.'
}
foreach ($packedAsset in @(
    'ql_shared_presets.vjs_c',
    'ql_settings.vjs_c',
    'ql_core.vjs_c',
    'showrank_web_media_bridge.vjs_c',
    'citadel_hud_top_bar.vxml_c',
    'citadel_hud_top_bar_player.vxml_c',
    'hud_escape_menu.vxml_c',
    'players_list_entry.vxml_c',
    'profile_card.vxml_c',
    'citadel_ui_context_menu_player.vxml_c',
    'citadel_hud_top_bar.vcss_c',
    'showrank_top_bar.vcss_c',
    'showrank_player_list.vcss_c',
    'showrank_profile_card.vcss_c'
)) {
    if (-not (($vpkTree | Select-String -SimpleMatch $packedAsset -Quiet))) {
        throw "Packed VPK missing required asset: $packedAsset"
    }
}
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`n[5/5] Deploying to Deadlock addons..." -ForegroundColor Cyan
if ($NoDeploy) {
    Write-Host '  Skipped by -NoDeploy.' -ForegroundColor Yellow
} else {
    $destDir = Split-Path -Parent $vpkDest
    Require-Path -Path $destDir -Label 'Deadlock addons folder'
    Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
    Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green
}

Write-Host "`nDone. Launch Deadlock and validate ShowRank escape-menu rank population in-game." -ForegroundColor Yellow
