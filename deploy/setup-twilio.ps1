<#
  Switch the live site from the simulated SMS driver to real Twilio, from the
  command line, without the credentials ever passing through a chat.

    1. copy deploy\twilio-env.example.yaml to deploy\twilio-env.yaml
    2. fill in your three values
    3. powershell -ExecutionPolicy Bypass -File deploy\setup-twilio.ps1 -RenderApiKey rnd_...

  Two things this does that a naive script would get wrong.

  It VALIDATES the credentials against Twilio before touching Render. The app
  now throws at startup if SMS_DRIVER=twilio and the credentials are bad, which
  is deliberate, but it means pushing an unverified token would take the live
  site down. So we check first.

  It MERGES the environment rather than replacing it. Render's env-vars endpoint
  is a full replace, so sending only the Twilio keys would wipe MONGODB_URI,
  JWT_SECRET and ADMIN_KEY and break the site completely.
#>

param(
  [Parameter(Mandatory = $true)][string]$RenderApiKey,
  [string]$ServiceId = "srv-dafdvf8u01pc73a2pr7g",
  [string]$TestTo = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ------------------------------------------------------------------ read
$envFile = Join-Path $PSScriptRoot "twilio-env.yaml"
if (-not (Test-Path $envFile)) {
  Write-Error "deploy\twilio-env.yaml not found. Copy twilio-env.example.yaml to it and fill in your values."
}
$yaml = Get-Content $envFile -Raw
function Get-Val($key) {
  $m = [regex]::Match($yaml, "(?m)^$key`:\s*""([^""]+)""")
  if (-not $m.Success) { throw "$key missing from deploy\twilio-env.yaml" }
  return $m.Groups[1].Value
}
$sid   = Get-Val "TWILIO_ACCOUNT_SID"
$token = Get-Val "TWILIO_AUTH_TOKEN"
$from  = Get-Val "TWILIO_PHONE_NUMBER"

if ($sid -notmatch '^AC[0-9a-fA-F]{32}$') { Write-Error "TWILIO_ACCOUNT_SID does not look right. It should start with AC followed by 32 hex characters." }
if ($from -notmatch '^\+[1-9]\d{6,14}$')  { Write-Error "TWILIO_PHONE_NUMBER must be full international format, e.g. +15551234567." }
if ($token -match 'your_auth_token')       { Write-Error "TWILIO_AUTH_TOKEN is still the placeholder." }
Write-Host "Read credentials for account $($sid.Substring(0,8))... (token not shown)"

# ------------------------------------------------------------------ verify with Twilio
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${sid}:${token}"))
$tw   = @{ Authorization = "Basic $pair" }

Write-Host ""
Write-Host "Checking the credentials against Twilio..."
try {
  $acct = Invoke-RestMethod -Uri "https://api.twilio.com/2010-04-01/Accounts/$sid.json" -Headers $tw -TimeoutSec 30
  Write-Host "  account : $($acct.friendly_name)  status=$($acct.status)  type=$($acct.type)"
  if ($acct.status -ne 'active') { Write-Error "Twilio account status is '$($acct.status)', not active." }
} catch {
  Write-Error "Twilio rejected these credentials. Check the SID and auth token at console.twilio.com. ($($_.Exception.Message))"
}

Write-Host "Checking that $from belongs to this account and can send SMS..."
try {
  $nums = Invoke-RestMethod -Uri "https://api.twilio.com/2010-04-01/Accounts/$sid/IncomingPhoneNumbers.json?PhoneNumber=$([uri]::EscapeDataString($from))" -Headers $tw -TimeoutSec 30
  $match = $nums.incoming_phone_numbers | Select-Object -First 1
  if (-not $match) { Write-Error "$from is not an active number on this Twilio account. Check Phone Numbers, Manage, Active numbers." }
  if (-not $match.capabilities.sms) { Write-Error "$from exists but is not SMS capable. Buy an SMS capable number." }
  Write-Host "  number  : $($match.phone_number)  sms=$($match.capabilities.sms)"
} catch {
  if ($_.Exception.Message -match 'not an active number|not SMS capable') { throw }
  Write-Error "Could not verify the number: $($_.Exception.Message)"
}

if ($acct.type -eq 'Trial') {
  Write-Host ""
  Write-Warning "This is a TRIAL account. Twilio trials can only send to numbers you have verified in the console, so real landlords will not receive codes until you upgrade."
}

Write-Host ""
Write-Warning "Check Messaging Geo Permissions before you rely on this. Twilio blocks SMS to most countries by default, South Africa included. console.twilio.com, Messaging, Settings, Geo Permissions, enable South Africa. This is the single most common reason a correctly configured Twilio setup still delivers nothing to +27 numbers."

# ------------------------------------------------------------------ optional live send
if ($TestTo) {
  Write-Host ""
  Write-Host "Sending a real test SMS to $TestTo ..."
  $body = @{ To = $TestTo; From = $from; Body = "Rent A Room test message. If you got this, SMS is working." }
  try {
    $msg = Invoke-RestMethod -Method POST -Uri "https://api.twilio.com/2010-04-01/Accounts/$sid/Messages.json" -Headers $tw -Body $body -TimeoutSec 45
    Write-Host "  queued, sid $($msg.sid), status $($msg.status)"
  } catch {
    Write-Error "Twilio refused the send. Very often this is Geo Permissions for the destination country. ($($_.Exception.Message))"
  }
}

# ------------------------------------------------------------------ push to Render
$hdrs = @{ Authorization = "Bearer $RenderApiKey"; "Content-Type" = "application/json"; Accept = "application/json" }

Write-Host ""
Write-Host "Reading the current Render environment so nothing gets wiped..."
$existing = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/env-vars?limit=100" -Headers $hdrs
$map = @{}
foreach ($e in $existing) { $map[$e.envVar.key] = $e.envVar.value }
Write-Host "  $($map.Count) variables currently set"

$map['SMS_DRIVER']                = 'twilio'
$map['TWILIO_ACCOUNT_SID']        = $sid
$map['TWILIO_AUTH_TOKEN']         = $token
$map['TWILIO_PHONE_NUMBER']       = $from
if (-not $map.ContainsKey('TWILIO_VERIFY_SERVICE_SID')) { $map['TWILIO_VERIFY_SERVICE_SID'] = '' }

$payload = @($map.GetEnumerator() | ForEach-Object { @{ key = $_.Key; value = [string]$_.Value } })
Write-Host "Writing $($payload.Count) variables back (4 changed, rest preserved)..."
Invoke-RestMethod -Method PUT -Uri "https://api.render.com/v1/services/$ServiceId/env-vars" -Headers $hdrs -Body ($payload | ConvertTo-Json -Depth 5) | Out-Null

Write-Host "Redeploying..."
$dep = Invoke-RestMethod -Method POST -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Headers $hdrs -Body '{"clearCache":"do_not_clear"}'
Write-Host "  deploy $($dep.id)"

$deadline = (Get-Date).AddMinutes(12)
$last = ""
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 20
  $d = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/deploys?limit=1" -Headers $hdrs
  $s = $d[0].deploy.status
  if ($s -ne $last) { Write-Host "  status: $s"; $last = $s }
  if ($s -eq 'live') { break }
  if ($s -in @('build_failed','update_failed','canceled')) {
    Write-Error "Deploy ended as '$s'. The app refuses to start when Twilio is misconfigured, so check the Render logs for the exact reason."
  }
}

# ------------------------------------------------------------------ verify
$url = (Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId" -Headers $hdrs).serviceDetails.url
if (-not $url) { $url = "https://rent-a-room-f0iy.onrender.com" }
Write-Host ""
Write-Host "Checking $url/health ..."
try {
  $h = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 120
  Write-Host "  $($h.status) / $($h.database)"
  Write-Host ""
  Write-Host "Twilio is live. Landlords will now receive real verification codes." -ForegroundColor Green
  Write-Host "Test it properly: open $url, start a landlord login with your own phone number, and see whether the SMS arrives."
} catch {
  Write-Warning "No health response yet. If the service is crash looping, Twilio credentials are the likely cause and the Render logs will say so."
}
