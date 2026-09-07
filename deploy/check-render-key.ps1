<#
  Diagnoses a Render API key without revealing it.

    powershell -ExecutionPolicy Bypass -File deploy\check-render-key.ps1 -ApiKey rnd_xxxx

  Prints the key's shape (length, prefix, whether stray quotes or spaces got
  pasted in) and Render's exact response body. Never prints the key itself, so
  the output is safe to share.
#>

param([Parameter(Mandatory = $true)][string]$ApiKey)

Write-Host ""
Write-Host "KEY SHAPE" -ForegroundColor Cyan
Write-Host "  length            : $($ApiKey.Length)"
Write-Host "  first 4 chars     : $($ApiKey.Substring(0, [Math]::Min(4, $ApiKey.Length)))"
Write-Host "  starts with rnd_  : $($ApiKey.StartsWith('rnd_'))"
Write-Host "  has quotes        : $($ApiKey.Contains('"') -or $ApiKey.Contains(""'""))"
Write-Host "  has spaces        : $($ApiKey.Contains(' '))"
Write-Host "  is the placeholder: $($ApiKey -eq 'rnd_YOURKEYHERE')"

if ($ApiKey -eq 'rnd_YOURKEYHERE') {
  Write-Host ""
  Write-Host "That is the placeholder text, not a real key." -ForegroundColor Red
  Write-Host "Create one at: Render dashboard > your avatar > Account Settings > API Keys > Create API Key"
  exit 1
}

Write-Host ""
Write-Host "CALLING RENDER" -ForegroundColor Cyan
$hdrs = @{ Authorization = "Bearer $ApiKey"; Accept = "application/json" }
try {
  $owners = Invoke-RestMethod -Method GET -Uri "https://api.render.com/v1/owners" -Headers $hdrs -TimeoutSec 30
  Write-Host "  OK. Workspaces visible to this key:" -ForegroundColor Green
  foreach ($o in $owners) { Write-Host "    $($o.owner.name)  id=$($o.owner.id)  email=$($o.owner.email)" }
  Write-Host ""
  Write-Host "Key is valid. Re-run deploy\deploy-render.ps1 with it." -ForegroundColor Green
} catch {
  $code = $null
  $body = ""
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
    } catch {}
  }
  Write-Host "  HTTP $code" -ForegroundColor Red
  Write-Host "  body: $body" -ForegroundColor Red
  Write-Host ""
  switch ($code) {
    401 { Write-Host "401 means Render does not recognise this key. Either it was mistyped, or it was never created, or it has been revoked. Make a fresh one in Account Settings > API Keys." }
    403 { Write-Host "403 means the key is real but lacks permission. Check you are looking at the right workspace." }
    default { Write-Host "Unexpected response. Send this whole output on." }
  }
}
Write-Host ""
