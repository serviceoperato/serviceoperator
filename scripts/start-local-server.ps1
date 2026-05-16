# Load .env and start Node (local admin + API). Default http://localhost:8080
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    Set-Item -Path "env:$name" -Value $value
  }
}

if (-not $env:PORT) { $env:PORT = "8080" }
Write-Host "Starting server on http://localhost:$($env:PORT) (ADMIN_PASSWORD_HASH loaded from .env)"
node server.mjs
