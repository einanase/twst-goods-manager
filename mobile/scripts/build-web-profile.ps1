param(
  [Parameter(Mandatory = $true)]
  [string]$Profile,

  [Parameter(Mandatory = $true)]
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $projectRoot ".env.$Profile"

if (-not (Test-Path $envFile)) {
  throw "Environment file not found: $envFile"
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $separatorIndex = $line.IndexOf("=")
  if ($separatorIndex -lt 1) {
    return
  }

  $key = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim()
  [Environment]::SetEnvironmentVariable($key, $value, "Process")
}

$env:EXPO_NO_DOTENV = "1"
$env:PWA_DIST_DIR = $OutputDir

Push-Location $projectRoot
try {
  & npm.cmd exec expo -- export --platform web --output-dir $OutputDir --clear
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  & node scripts/prepare-pwa-export.mjs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
