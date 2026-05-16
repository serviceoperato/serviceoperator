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

python "$RepoRoot\scripts\process_voice_recorder_pipeline.py"
exit $LASTEXITCODE
