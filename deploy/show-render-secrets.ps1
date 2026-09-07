<#
  Prints the four secret values Render needs, ready to copy into its dashboard.

  Run this on your own machine. It reads deploy\cloudrun-env.yaml (gitignored)
  and shows only the four keys marked sync:false in render.yaml. Nothing is sent
  anywhere; this only prints to your screen.

    .\deploy\show-render-secrets.ps1
#>

$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot "cloudrun-env.yaml"
if (-not (Test-Path $envFile)) {
  Write-Error "deploy\cloudrun-env.yaml not found. Run deploy\setup-atlas-user.ps1 first."
}

$yaml = Get-Content $envFile -Raw
$keys = @("MONGODB_URI", "JWT_SECRET", "JWT_REFRESH_SECRET", "ADMIN_KEY")

Write-Host ""
Write-Host "Paste these four into Render > your service > Environment" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
foreach ($k in $keys) {
  $m = [regex]::Match($yaml, "(?m)^$k`:\s*""([^""]+)""")
  if ($m.Success) {
    Write-Host ""
    Write-Host $k -ForegroundColor Yellow
    Write-Host $m.Groups[1].Value
  } else {
    Write-Host "$k  << NOT FOUND" -ForegroundColor Red
  }
}
Write-Host ""
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "ADMIN_KEY is the password for the /admin portal on the live site."
Write-Host "Close this window when you are done."
Write-Host ""
