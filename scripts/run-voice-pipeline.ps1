# Run Voice Recorder pipeline locally (Windows + G:\My Drive\Voice Recorder).
# Usage: .\scripts\run-voice-pipeline.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "Repo: $RepoRoot"
Write-Host "Input: G:\My Drive\Voice Recorder"
Write-Host ""

python "$RepoRoot\scripts\process_voice_recorder_pipeline.py"
exit $LASTEXITCODE
