<#
  Deploy Rent A Room to Render entirely from the command line.

  WHAT YOU DO FIRST (once, in a browser, unavoidable):
    1. render.com -> Get Started -> "GitHub". No card.
    2. Authorise Render to read the repo DavidGhost101/rent-a-room.
       It is private, so Render must be granted access or the build cannot
       fetch it. On the GitHub authorisation screen pick "Only select
       repositories" and choose rent-a-room.
    3. Render dashboard -> click your avatar -> Account Settings -> API Keys
       -> Create API Key. Copy it.

  THEN RUN THIS:
    .\deploy\deploy-render.ps1 -ApiKey rnd_xxxxxxxxxxxxxxxx

  It creates the web service, sets every environment variable including the
  four secrets from deploy\cloudrun-env.yaml, starts the build, waits for it,
  and prints the live URL. Nothing secret is echoed.
#>

param(
  [string]$ApiKey = $env:RENDER_API_KEY,
  [string]$ServiceName = "rent-a-room",
  [string]$Repo = "https://github.com/DavidGhost101/rent-a-room",
  [string]$Branch = "main",
  [string]$Region = "frankfurt",
  [switch]$SkipWait
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $ApiKey) {
  Write-Error "No API key. Pass -ApiKey rnd_... or set `$env:RENDER_API_KEY. Create one at Render > Account Settings > API Keys."
}

$api  = "https://api.render.com/v1"
$hdrs = @{ Authorization = "Bearer $ApiKey"; "Content-Type" = "application/json"; Accept = "application/json" }

function Invoke-Render($Method, $Path, $Body) {
  $uri = "$api$Path"
  try {
    if ($Body) {
      return Invoke-RestMethod -Method $Method -Uri $uri -Headers $hdrs -Body ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $hdrs
  } catch {
    $detail = ""
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $detail = $reader.ReadToEnd()
    }
    throw "Render API $Method $Path failed: $($_.Exception.Message)`n$detail"
  }
}

# ---------------------------------------------------------------- secrets
$envFile = Join-Path $PSScriptRoot "cloudrun-env.yaml"
if (-not (Test-Path $envFile)) {
  Write-Error "deploy\cloudrun-env.yaml not found. Run deploy\setup-atlas-user.ps1 first."
}
$yaml = Get-Content $envFile -Raw
function Get-Secret($key) {
  $m = [regex]::Match($yaml, "(?m)^$key`:\s*""([^""]+)""")
  if (-not $m.Success) { throw "$key missing from cloudrun-env.yaml" }
  return $m.Groups[1].Value
}

$envVars = @(
  @{ key = "NODE_ENV";                value = "production" },
  @{ key = "HOST";                    value = "0.0.0.0" },
  @{ key = "JWT_EXPIRES_IN";          value = "2h" },
  @{ key = "JWT_REFRESH_EXPIRES_IN";  value = "7d" },
  @{ key = "SMS_DRIVER";              value = "local" },
  @{ key = "EMAIL_FROM";              value = "noreply@rentaroomsoweto.co.za" },
  @{ key = "MONGODB_URI";             value = (Get-Secret "MONGODB_URI") },
  @{ key = "JWT_SECRET";              value = (Get-Secret "JWT_SECRET") },
  @{ key = "JWT_REFRESH_SECRET";      value = (Get-Secret "JWT_REFRESH_SECRET") },
  @{ key = "ADMIN_KEY";               value = (Get-Secret "ADMIN_KEY") }
)
Write-Host "Loaded $($envVars.Count) environment variables (values not shown)."

# ---------------------------------------------------------------- owner
$owners = Invoke-Render GET "/owners"
if (-not $owners) { Write-Error "No workspaces returned. Is the API key valid?" }
$ownerId = $owners[0].owner.id
Write-Host "Workspace: $($owners[0].owner.name)  ($ownerId)"

# ---------------------------------------------------------------- existing?
$existing = $null
try {
  $found = Invoke-Render GET "/services?name=$ServiceName&limit=20"
  if ($found) { $existing = ($found | Where-Object { $_.service.name -eq $ServiceName } | Select-Object -First 1).service }
} catch { }

if ($existing) {
  Write-Host "Service already exists ($($existing.id)). Updating environment and redeploying."
  Invoke-Render PUT "/services/$($existing.id)/env-vars" $envVars | Out-Null
  $deploy = Invoke-Render POST "/services/$($existing.id)/deploys" @{ clearCache = "do_not_clear" }
  $serviceId = $existing.id
  $serviceUrl = $existing.serviceDetails.url
} else {
  Write-Host "Creating service '$ServiceName' from $Repo ($Branch), region $Region, free plan..."
  $body = @{
    type        = "web_service"
    name        = $ServiceName
    ownerId     = $ownerId
    repo        = $Repo
    branch      = $Branch
    autoDeploy  = "yes"
    envVars     = $envVars
    serviceDetails = @{
      env    = "docker"
      plan   = "free"
      region = $Region
      envSpecificDetails = @{
        dockerfilePath = "./Dockerfile"
        dockerContext  = "."
      }
      healthCheckPath = "/health"
    }
  }
  $created = Invoke-Render POST "/services" $body
  $serviceId  = $created.service.id
  $serviceUrl = $created.service.serviceDetails.url
  Write-Host "Created service $serviceId"
}

if (-not $serviceUrl) { $serviceUrl = "https://$ServiceName.onrender.com" }
Write-Host ""
Write-Host "Service URL will be: $serviceUrl"

if ($SkipWait) { Write-Host "Skipping wait. Check the Render dashboard for build progress."; exit 0 }

# ---------------------------------------------------------------- wait
Write-Host ""
Write-Host "Waiting for the first build. A Docker build from cold usually takes 4 to 8 minutes."
$deadline = (Get-Date).AddMinutes(20)
$lastStatus = ""
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 20
  try {
    $deploys = Invoke-Render GET "/services/$serviceId/deploys?limit=1"
    $d = $deploys[0].deploy
    if ($d.status -ne $lastStatus) { Write-Host "  status: $($d.status)"; $lastStatus = $d.status }
    if ($d.status -eq "live") { break }
    if ($d.status -in @("build_failed", "update_failed", "canceled", "deactivated")) {
      Write-Error "Deploy ended as '$($d.status)'. Open the Render dashboard logs for this service to see why."
    }
  } catch {
    Write-Host "  (still starting up)"
  }
}

# ---------------------------------------------------------------- verify
Write-Host ""
Write-Host "Checking $serviceUrl/health ..."
try {
  $h = Invoke-RestMethod -Uri "$serviceUrl/health" -TimeoutSec 120
  Write-Host "  status  : $($h.status)"
  Write-Host "  database: $($h.database)"
  Write-Host ""
  if ($h.database -eq "connected") {
    Write-Host "LIVE and talking to Atlas: $serviceUrl" -ForegroundColor Green
    Write-Host "Admin portal: $serviceUrl/admin   (password is ADMIN_KEY, see deploy\ADMIN-PASSWORD.txt)"
    Write-Host ""
    Write-Host "Next, point the Android app at it and rebuild the APK:"
    Write-Host "  .\deploy\set-live-url.ps1 -Url $serviceUrl"
  } else {
    Write-Warning "Up, but database reports '$($h.database)'. Check MONGODB_URI, and that Atlas Network Access allows 0.0.0.0/0."
  }
} catch {
  Write-Warning "No health response yet. On the free plan a cold service takes 30-50s to wake. Try again in a minute: Invoke-RestMethod $serviceUrl/health"
}
