# Commit and push AI-ready voice pipeline outputs (run only after validate_voice_publish.py passes).
# Usage: .\scripts\git_publish_voice_outputs.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$commitMsg = "Update AI-ready voice transcription outputs"

$paths = @(
  "content/meetings",
  "content/notes",
  "content/tasks",
  "content/calendar",
  "content/projects",
  "content/decisions",
  "content/open-points",
  "content/transcriptions",
  "content/processed/processed_files.json",
  "content/processed/transcriptions_index.json",
  "content/processed/latest_pipeline_run.json",
  "content/processed/pipeline_runs.json",
  "content/processed/phase2_registry.json"
)

foreach ($p in $paths) {
  $full = Join-Path $RepoRoot $p
  if (Test-Path $full) {
    git add -- $p
  }
}

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "No voice pipeline changes to commit."
  exit 0
}

git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git push
exit $LASTEXITCODE
