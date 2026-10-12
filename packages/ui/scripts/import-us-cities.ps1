param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$uiRoot = Split-Path -Parent $PSScriptRoot
$stateSource = Get-Content -LiteralPath (Join-Path $uiRoot 'src/us-states.ts') -Raw
$stateCodes = [regex]::Matches($stateSource, 'value: "([a-z]{2})"') | ForEach-Object { $_.Groups[1].Value }
if ($stateCodes.Count -ne 51) { throw 'Expected 50 states and District of Columbia.' }

$citiesByState = @{}
foreach ($state in $stateCodes) {
  $citiesByState[$state] = [System.Collections.Generic.SortedSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
}

$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath))
try {
  $entry = $archive.GetEntry('US.txt')
  if ($null -eq $entry) { throw 'Archive is missing US.txt.' }
  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    $sourceRowCount = 0
    while ($null -ne ($line = $reader.ReadLine())) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $columns = $line.Split("`t")
      if ($columns.Count -ne 12) { throw 'Unexpected GeoNames postal data format.' }
      if ($columns[0] -ne 'US') { throw 'Archive contains a non-US record.' }
      $sourceRowCount++
      $state = $columns[4].Trim().ToLowerInvariant()
      $city = $columns[2].Trim()
      if ($citiesByState.ContainsKey($state) -and $city.Length -gt 0) {
        [void]$citiesByState[$state].Add($city)
      }
    }
  } finally { $reader.Dispose() }
} finally { $archive.Dispose() }

foreach ($state in $stateCodes) {
  if ($citiesByState[$state].Count -eq 0) { throw "No localities found for $state." }
}

$outputDirectory = Join-Path $uiRoot 'src/data/us-cities'
[void][System.IO.Directory]::CreateDirectory($outputDirectory)
$utf8 = [System.Text.UTF8Encoding]::new($false)
$localityCount = 0
foreach ($state in $stateCodes) {
  $names = @($citiesByState[$state])
  $localityCount += $names.Count
  $json = ConvertTo-Json -InputObject $names
  [System.IO.File]::WriteAllText((Join-Path $outputDirectory "$state.json"), ($json -replace "`r`n", "`n") + "`n", $utf8)
}

$hash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "Imported $localityCount state/locality pairs from $sourceRowCount postal records."
Write-Output "Archive SHA-256: $hash"
