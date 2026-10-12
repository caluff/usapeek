# United States address locality suggestions

The state files are derived from [GeoNames US postal codes](https://download.geonames.org/export/zip/US.zip), downloaded on **2026-10-03**. Attribution: [GeoNames](https://www.geonames.org/). The [current postal dataset readme](https://download.geonames.org/export/zip/readme.txt) identifies the license as **Creative Commons Attribution 4.0**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Retain this attribution and provide a GeoNames link in the address autocomplete. The readme also retains an older 3.0 link; its stated license version is 4.0.

- Source archive SHA-256: `b0c65ad3661c2dbda1d833f72b5e3402a886d3759f040b35e6bfa7ad5241f5b3`
- Source: 41,490 postal records; output: 29,540 state/locality pairs.
- Coverage: all 50 states plus the District of Columbia, matching `US_STATES`. Territories and military postal regions are outside this catalog.
- Transformation: retain US rows with a supported state code, trim place names, deduplicate names within each state (case insensitive), sort names using ordinal case-insensitive comparison, and output one JSON array per state. Source spelling is retained; no cities are invented or population thresholds applied.

Postal localities can include unincorporated places, neighborhoods, and postal names that are not incorporated cities. This snapshot is an autocomplete catalog, **not address validation or a guarantee of deliverability, accuracy, completeness, or current USPS acceptance**. New names and alternate spellings may be absent. Do not treat membership in this catalog as proof that a street address exists.

`loadUsCities(province)` loads only the selected state's bundled JSON. There are no external runtime requests or API keys. Unknown states return an empty list; failed chunk loads reject so callers can show a retry state. `normalizeUsState` accepts state codes, `US-XX` codes, and full English state names, and returns the existing lowercase two-letter code or an empty string.

## Reimport

Run from the repository root in PowerShell; no additional packages are required:

```powershell
$cityArchive = Join-Path $env:TEMP 'marketplace-geonames-us.zip'
Invoke-WebRequest -Uri 'https://download.geonames.org/export/zip/US.zip' -OutFile $cityArchive
& ./packages/ui/scripts/import-us-cities.ps1 -ArchivePath $cityArchive
```

The importer validates all state buckets before writing, and prints the source hash and counts. An archive with the recorded hash reproduces these files. The source URL can change; after an intentional refresh, review the diff and update this file's retrieval date, hash, counts, and any license changes.
