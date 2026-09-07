<#
  Point the Android app at the live backend, then push so CI rebuilds the APK.

  Run this once the backend is deployed and you have its URL:

    .\deploy\set-live-url.ps1 -Url https://rent-a-room.onrender.com

  It rewrites android-app\www\config.js, verifies the URL actually answers,
  commits, and pushes. The push triggers .github/workflows/android-build.yml,
  which produces a fresh APK pointing at the live backend.

  If you have your own domain, pass that instead of the platform URL. An
  installed APK cannot be updated remotely, so whatever goes in here is what
  every installed copy talks to forever.
#>

param(
  [Parameter(Mandatory = $true)][string]$Url
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$Url = $Url.TrimEnd('/')
if ($Url -notmatch '^https://') {
  Write-Error "Use an https:// URL. Android blocks plain http by default, and the app sets allowMixedContent=false."
}

Write-Host "Checking $Url/health ..."
try {
  $h = Invoke-RestMethod -Uri "$Url/health" -TimeoutSec 90
  Write-Host "  status  : $($h.status)"
  Write-Host "  database: $($h.database)"
  if ($h.database -ne 'connected') {
    Write-Warning "Backend is up but reports database '$($h.database)'. Check MONGODB_URI in the host's dashboard before shipping an APK."
  }
} catch {
  Write-Error "No healthy response from $Url/health. On a free plan the first request can take 30-50s while the service wakes, so try again before assuming it is broken. ($($_.Exception.Message))"
}

$cfg = "android-app\www\config.js"
$content = Get-Content $cfg -Raw
$updated = [regex]::Replace($content, "window\.API_BASE_URL\s*=\s*'[^']*';", "window.API_BASE_URL = '$Url';")
if ($updated -eq $content) { Write-Error "Could not find the window.API_BASE_URL line in $cfg." }
Set-Content -Path $cfg -Value $updated -Encoding UTF8 -NoNewline
Write-Host "Set API_BASE_URL to $Url in $cfg"

git add $cfg
git -c user.name='David Rakosa' -c user.email='DavidGhost101@users.noreply.github.com' commit -q -m "Point Android app at the live backend at $Url

Replaces the placeholder in android-app/www/config.js. Pushing this triggers
the APK build workflow, so the artifact it produces talks to the real backend.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J8TvQgVDTNPrckHwS5eV91"

git push origin main
Write-Host ""
Write-Host "Pushed. The APK build is running now."
Write-Host "Watch it with:  gh run watch"
Write-Host "Download it from the run's Artifacts section as 'rent-a-room-debug-apk'."
