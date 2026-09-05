<#
  Deploy Rent A Room to Google Cloud Run from source.

  No Docker needed locally: gcloud uploads the source, Cloud Build builds the
  image in Google's cloud using the repo Dockerfile, and Cloud Run runs it.

  Usage (from the repo root):
    .\deploy\deploy-cloudrun.ps1 -ProjectId my-gcp-project-id

  Prerequisites:
    1. gcloud installed and authenticated:  gcloud auth login
    2. A GCP project with a billing account attached
    3. deploy\cloudrun-env.yaml filled in (copy from cloudrun-env.example.yaml)
#>

param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Region = "africa-south1",
  [string]$ServiceName = "rent-a-room"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$envFile = Join-Path $PSScriptRoot "cloudrun-env.yaml"
if (-not (Test-Path $envFile)) {
  Write-Error "Missing deploy\cloudrun-env.yaml. Copy cloudrun-env.example.yaml, fill it in, then rerun."
}

Write-Host "Project : $ProjectId"
Write-Host "Region  : $Region"
Write-Host "Service : $ServiceName"
Write-Host ""

Write-Host "Enabling required APIs (first run only, takes a minute)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $ProjectId

Write-Host ""
Write-Host "Deploying from source..."
gcloud run deploy $ServiceName `
  --source . `
  --project $ProjectId `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --memory 512Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 4 `
  --timeout 300 `
  --env-vars-file $envFile

if ($LASTEXITCODE -ne 0) { Write-Error "Deploy failed. See the Cloud Build log link above." }

Write-Host ""
$url = (gcloud run services describe $ServiceName --project $ProjectId --region $Region --format "value(status.url)")
Write-Host "Live at: $url"
Write-Host ""
Write-Host "Smoke test:"
try {
  $health = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 30
  $health | ConvertTo-Json -Depth 4
} catch {
  Write-Warning "Health check did not respond yet. Cold start can take a few seconds, try again."
}
