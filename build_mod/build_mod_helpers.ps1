function Get-NextPakName {
    param([string]$TargetDir)
    $occupied = @{}
    foreach ($file in (Get-ChildItem -LiteralPath $TargetDir -File -ErrorAction Stop)) {
        # Orphaned data shards still occupy a slot; do not overwrite them.
        if ($file.Name -match '^pak(\d{2})_(?:dir|\d{3})\.vpk$') {
            $occupied[[int]$matches[1]] = $true
        }
    }
    for ($number = 1; $number -le 99; $number++) {
        if (-not $occupied.ContainsKey($number)) { return 'pak{0:D2}_dir.vpk' -f $number }
    }
    throw 'All addon slots pak01 through pak99 are occupied. Remove unused addons before building.'
}

function Assert-BuildChildPath {
    param([string]$Path, [string]$Parent)
    $root = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $target = [IO.Path]::GetFullPath($Path)
    if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Build path escapes its parent: $target"
    }
}

function Get-VpkBundleFiles {
    param([string]$Directory, [string]$Leaf)
    $names = @($Leaf)
    if ($Leaf -match '^(.*)_dir\.vpk$') {
        $pattern = '^' + [regex]::Escape($matches[1]) + '_\d{3}\.vpk$'
        $names += @(Get-ChildItem -LiteralPath $Directory -File | Where-Object { $_.Name -match $pattern } |
            Select-Object -ExpandProperty Name)
    }
    foreach ($name in $names) {
        $path = Join-Path $Directory $name
        Assert-BuildChildPath -Path $path -Parent $Directory
        if (Test-Path -LiteralPath $path -PathType Leaf) { Get-Item -LiteralPath $path }
    }
}

function New-ReleaseArchive {
    param([string]$SourceRoot, [string]$OutputVpk)
    $version = (Get-Content -LiteralPath (Join-Path $SourceRoot 'package.json') -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a three-part package version.' }
    if (-not (Test-Path -LiteralPath $OutputVpk -PathType Leaf)) { throw "Missing build output: $OutputVpk" }
    $directory = Split-Path $OutputVpk
    $files = @(Get-VpkBundleFiles -Directory $directory -Leaf (Split-Path $OutputVpk -Leaf))
    foreach ($name in @('LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md')) {
        $path = Join-Path $SourceRoot $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing distribution notice: $path" }
        $files += Get-Item -LiteralPath $path
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $destination = Join-Path $directory ('QOL-Lock-' + $version.Replace('.', '') + '.zip')
    $temporary = Join-Path $directory ('.release-' + [guid]::NewGuid().ToString('N') + '.zip')
    try {
        $archive = [IO.Compression.ZipFile]::Open($temporary, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($file in $files) {
                $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $file.FullName, $file.Name, [IO.Compression.CompressionLevel]::Optimal)
            }
        } finally { $archive.Dispose() }
        # Keep the previous ZIP until the new archive is completely written.
        if (Test-Path -LiteralPath $destination) {
            [IO.File]::Replace($temporary, $destination, [NullString]::Value)
        } else {
            [IO.File]::Move($temporary, $destination)
        }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    return $destination
}

function Publish-VpkBundle {
    param([string]$Staging, [string]$Output)
    $parent = Split-Path $Output
    $leaf = Split-Path $Output -Leaf
    Assert-BuildChildPath -Path $Staging -Parent $parent
    Assert-BuildChildPath -Path $Output -Parent $parent
    $primary = Join-Path $Staging $leaf
    if (-not (Test-Path -LiteralPath $primary -PathType Leaf) -or (Get-Item -LiteralPath $primary).Length -eq 0) {
        throw "VPK packer did not produce a nonempty output: $primary"
    }
    $incoming = @(Get-VpkBundleFiles -Directory $Staging -Leaf $leaf)
    $previous = @(Get-VpkBundleFiles -Directory $parent -Leaf $leaf)
    $backup = Join-Path $Staging 'previous'
    Assert-BuildChildPath -Path $backup -Parent $Staging
    New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
    $saved = New-Object System.Collections.Generic.List[string]
    $installed = New-Object System.Collections.Generic.List[string]
    try {
        foreach ($file in $previous) {
            Move-Item -LiteralPath $file.FullName -Destination (Join-Path $backup $file.Name) -ErrorAction Stop
            $saved.Add($file.Name)
        }
        # Install the directory index last, after its data archives.
        foreach ($file in ($incoming | Sort-Object { $_.Name -eq $leaf })) {
            Move-Item -LiteralPath $file.FullName -Destination (Join-Path $parent $file.Name) -ErrorAction Stop
            $installed.Add($file.Name)
        }
    } catch {
        $failure = $_
        try {
            foreach ($name in $installed) {
                Remove-Item -LiteralPath (Join-Path $parent $name) -Force -ErrorAction Stop
            }
            foreach ($name in $saved) {
                Move-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $parent $name) -ErrorAction Stop
            }
        } catch {
            throw "Replacement and rollback failed. Previous files are preserved in '$backup': $_"
        }
        throw $failure
    }
    # Delete backups only after every replacement succeeded.
    Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction Stop
}
