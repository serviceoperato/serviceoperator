# Run Voice Recorder pipeline on this Windows PC (Google Drive input).
# Usage: .\scripts\run-voice-pipeline.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "Repo: $RepoRoot"
Write-Host "Input: G:\My Drive\Voice Recorder"
Write-Host ""

python -c "import faster_whisper" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing Python deps from requirements-voice.txt ..."
  pip install -r "$RepoRoot\requirements-voice.txt"
}

ffmpeg -version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "FFmpeg not found. Install with: winget install Gyan.FFmpeg"
  Write-Host "Then open a new PowerShell window and run this script again."
  exit 1
}

# Phase 1 — transcription + immediate per-file Phase 2
python "$RepoRoot\scripts\transcribe_voice_recorder.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Phase 2 — daily AI-ready processing (runbook Steps 0–7)
python "$RepoRoot\scripts\process_daily_voice_phase2.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Rebuild admin index
python "$RepoRoot\scripts\index_transcriptions.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Validate before any publish/commit
python "$RepoRoot\scripts\validate_voice_publish.py"
exit $LASTEXITCODE
