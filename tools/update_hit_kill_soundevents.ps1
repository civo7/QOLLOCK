<#
.SYNOPSIS
Rewrites the Hitsound/Killsound sound events from the clips found on disk.

.DESCRIPTION
The game only plays clips that are listed in the sound events file, so this runs
automatically at the start of build_mod.ps1. You can also run it by hand:

    powershell -ExecutionPolicy Bypass -File tools\update_hit_kill_soundevents.ps1

Clips
    Each dropdown option owns a folder named after it, lowercase with spaces removed
    ("Quake 3" -> quake3), holding numbered clips: sounds\hitsounds\quake3\quake300.wav
    ... quake399.wav (1 to 100 clips). Every volume step lists all of the option's
    clips and the game picks one at random each time it plays. Option names come from
    HITSOUND_TYPE / KILLSOUND_TYPE in panorama\scripts\ql_shared_presets.js.

Custom
    The Custom option has no folder in this repo. Its 100 slots, sounds\hitsounds\custom\custom00 to
    custom99 (and the same for killsounds), are supplied by a pack made with the QOL Lock Audio
    Pack Builder, like the custom announcers. The events always list all 100.

Volume
    Steps _V0 to _V100 use the Announcer's scale: volume = step / 10, so step 10 is
    unity gain and step 100 is 10x.

Works in Windows PowerShell 5.1 and PowerShell 7.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$invariant = [System.Globalization.CultureInfo]::InvariantCulture
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$eventsFile = Join-Path $RepoRoot 'soundevents\world_ambient_emitters.vsndevts'
$schemaFile = Join-Path $RepoRoot 'panorama\scripts\ql_shared_presets.js'
$groups = @(
    @{ Prefix = 'Hitsound';  Folder = 'hitsounds';  Key = 'HITSOUND_TYPE' },
    @{ Prefix = 'Killsound'; Folder = 'killsounds'; Key = 'KILLSOUND_TYPE' }
)
$maxClips = 100
$volumeSteps = 101   # _V0 .. _V100
$customSlotCount = 100   # custom00 .. custom99, supplied by a pack

$baseEvent = @(
    "`tQOL.HitKillSoundBase = ",
    "`t{",
    "`t`tbase = `"Base.UI`"",
    "`t`tocclusion_scale = 0.000000",
    "`t`tocclusion_scale_non_player = 0.000000",
    "`t`tocclusion_min = 1.000000",
    "`t`tocclusion_volume_blend_distance_min = 0.000000",
    "`t`tocclusion_volume_blend_distance_max = 0.000000",
    "`t`tdistance_lpf_on = 0.000000",
    "`t}",
    ""
) -join "`n"

function Get-Slug([string]$label) {
    return ($label -replace '[^A-Za-z0-9]', '')
}

function Get-OptionLabels([string]$schemaText, [string]$key) {
    $entry = [regex]::Match($schemaText, '\{"key":"' + [regex]::Escape($key) + '".*"options":(\[\[.*?\]\])')
    if (-not $entry.Success) { throw "Cannot find options for $key in $schemaFile" }
    $labels = @()
    foreach ($option in [regex]::Matches($entry.Groups[1].Value, '\[(\d+),"([^"]*)"\]')) {
        $labels += $option.Groups[2].Value
    }
    return $labels
}

function Get-Clips([string]$folder, [string]$name) {
    $directory = Join-Path $RepoRoot ('sounds\' + $folder + '\' + $name)
    if (-not (Test-Path -LiteralPath $directory)) { throw "Missing folder sounds\$folder\$name\" }
    $clips = @{}
    foreach ($file in (Get-ChildItem -LiteralPath $directory -File)) {
        $match = [regex]::Match($file.Name, '^' + [regex]::Escape($name) + '(\d\d)\.wav$', 'IgnoreCase')
        if (-not $match.Success) {
            if ($file.Extension -ieq '.wav') {
                throw "sounds\$folder\$name\$($file.Name): clips must be named ${name}00.wav to ${name}99.wav"
            }
            continue
        }
        $clips[[int]$match.Groups[1].Value] = $file
    }
    if ($clips.Count -lt 1 -or $clips.Count -gt $maxClips) {
        throw "sounds\$folder\$name\ needs between 1 and $maxClips clips named ${name}NN.wav"
    }
    $sorted = @()
    foreach ($number in ($clips.Keys | Sort-Object)) { $sorted += $clips[$number] }
    return $sorted
}

# Length in seconds of a PCM WAV file, from its fmt and data chunks.
function Get-WavSeconds([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $position = 12
    $byteRate = 0
    $dataSize = 0
    while ($position + 8 -le $bytes.Length) {
        $id = [System.Text.Encoding]::ASCII.GetString($bytes, $position, 4)
        $size = [BitConverter]::ToUInt32($bytes, $position + 4)
        if ($id -eq 'fmt ') {
            $byteRate = [BitConverter]::ToUInt32($bytes, $position + 16)
        } elseif ($id -eq 'data') {
            $dataSize = [Math]::Min([double]$size, [double]($bytes.Length - $position - 8))
            break
        }
        $position += 8 + [int64]$size + ([int64]$size % 2)
    }
    if ($byteRate -le 0) { throw "$path is not a WAV file the sound tool can read" }
    return $dataSize / $byteRate
}

function Build-Events([string]$schemaText) {
    $out = New-Object System.Text.StringBuilder
    [void]$out.Append($baseEvent)
    foreach ($group in $groups) {
        foreach ($label in (Get-OptionLabels $schemaText $group.Key)) {
            $slug = Get-Slug $label
            $name = $slug.ToLowerInvariant()
            $listed = ''
            $durationLine = ''
            if ($name -eq 'custom') {
                # Supplied by a pack: no files here, no known length.
                for ($slot = 0; $slot -lt $customSlotCount; $slot++) {
                    $listed += "`t`t`t`"sounds/$($group.Folder)/custom/custom$($slot.ToString('00')).vsnd`",`n"
                }
                $summary = "$customSlotCount pack slot(s)"
            } else {
                $files = Get-Clips $group.Folder $name
                $length = 0.0
                foreach ($file in $files) {
                    $listed += "`t`t`t`"sounds/$($group.Folder)/$name/$($file.BaseName).vsnd`",`n"
                    $length = [Math]::Max($length, (Get-WavSeconds $file.FullName))
                }
                $durationLine = "`t`tvsnd_duration = $($length.ToString('0.000000', $invariant))`n"
                $summary = "$($files.Count) clip(s)"
            }
            for ($volume = 0; $volume -lt $volumeSteps; $volume++) {
                $volumeText = ($volume / 10.0).ToString('0.000000', $invariant)
                [void]$out.Append("`tQOL.$($group.Prefix).${slug}_V$volume = `n`t{`n`t`tbase = `"QOL.HitKillSoundBase`"`n")
                [void]$out.Append("`t`tvolume = $volumeText`n`t`tvsnd_files = `n`t`t[`n$listed`t`t]`n")
                [void]$out.Append("$durationLine`t}`n")
            }
            Write-Host ("  {0}.{1}: {2}" -f $group.Prefix, $label, $summary)
        }
    }
    return $out.ToString()
}

$source = [System.IO.File]::ReadAllText($eventsFile)
$usesCrLf = $source.Contains("`r`n")
$normalized = $source.Replace("`r`n", "`n")
$oldBlock = '\tQOL\.(?:HitKillSoundBase|Hitsound\.\w+|Killsound\.\w+) = \n\t\{[^{}]*\}\n'
$stripped = [regex]::Replace($normalized, $oldBlock, '')
$end = $stripped.TrimEnd().LastIndexOf('}')
if ($end -lt 0) { throw "$eventsFile has no closing brace" }
$schemaText = [System.IO.File]::ReadAllText($schemaFile)
$result = $stripped.Substring(0, $end) + (Build-Events $schemaText) + $stripped.Substring($end)
if ($usesCrLf) { $result = $result.Replace("`n", "`r`n") }

if ($result -ceq $source) {
    Write-Host 'Hit/kill sound events are up to date.'
} else {
    [System.IO.File]::WriteAllText($eventsFile, $result, $utf8NoBom)
    Write-Host 'Hit/kill sound events updated from the clips in sounds\hitsounds and sounds\killsounds.'
}
