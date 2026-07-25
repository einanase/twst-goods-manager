param(
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Read-EnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $values = @{}
  if (-not (Test-Path $Path)) {
    throw "Environment file not found: $Path"
  }

  Get-Content $Path | ForEach-Object {
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
    $values[$key] = $value
  }

  return $values
}

$productionEnv = Read-EnvFile (Join-Path $projectRoot ".env.production")
$wifeEnv = Read-EnvFile (Join-Path $projectRoot ".env.wife")

[Environment]::SetEnvironmentVariable("EXPO_PUBLIC_SUPABASE_URL", $productionEnv["EXPO_PUBLIC_SUPABASE_URL"], "Process")
[Environment]::SetEnvironmentVariable("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", $productionEnv["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "Process")
[Environment]::SetEnvironmentVariable("EXPO_PUBLIC_HOME_SUPABASE_URL", $wifeEnv["EXPO_PUBLIC_SUPABASE_URL"], "Process")
[Environment]::SetEnvironmentVariable("EXPO_PUBLIC_HOME_SUPABASE_PUBLISHABLE_KEY", $wifeEnv["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "Process")

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
