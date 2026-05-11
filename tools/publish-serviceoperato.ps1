#Requires -Version 5.1
<#
  Creates https://github.com/serviceoperato/serviceopera.to-site (if missing) and pushes main + tags.
  Usage (in Cursor / PowerShell, once):
    $env:SERVICEOPERATO_GITHUB_PAT = 'ghp_xxxxxxxx'   # PAT: serviceoperato account, scope: repo
    ./tools/publish-serviceoperato.ps1

  Remote is restored to HTTPS without embedded credentials after push.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$owner = 'serviceoperato'
$repo = 'serviceopera.to-site'
$pat = $env:SERVICEOPERATO_GITHUB_PAT
if (-not $pat) {
  Write-Error 'Set SERVICEOPERATO_GITHUB_PAT to a GitHub PAT for the serviceoperato account (repo scope).'
}

$headers = @{
  Authorization = "Bearer $pat"
  Accept        = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

$login = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers
if ($login.login -ne $owner) {
  Write-Error "This PAT is for '$($login.login)', not '$owner'. Use a token from the serviceoperato account."
}

$exists = $false
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo" -Headers $headers -Method Get | Out-Null
  $exists = $true
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
}

if (-not $exists) {
  $body = @{
    name        = $repo
    description = 'Service Opera static site (landing + client workspace)'
    private     = $false
    has_issues  = $true
    has_wiki    = $false
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
  Write-Host "Created https://github.com/$owner/$repo"
} else {
  Write-Host "Repo already exists: https://github.com/$owner/$repo"
}

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$clean = "https://github.com/$owner/$repo.git"
$authed = "https://${owner}:$pat@github.com/$owner/$repo.git"
git remote set-url origin $clean
git push $authed main
if (git tag -l 'v1.0.1') {
  git push $authed v1.0.1
}
git remote set-url origin $clean
Write-Host 'Done. Remote reset to clean HTTPS URL.'
