$ErrorActionPreference = "Continue"
$base = "http://127.0.0.1:3000"
$admin = @{ "x-admin-key" = "local_dev_admin_key_123" }
function Show($label, $block) {
  try { $r = & $block; Write-Host "[PASS] $label" -ForegroundColor Green; return $r }
  catch { Write-Host "[FAIL] $label :: $($_.Exception.Message)" -ForegroundColor Red; return $null }
}

Show "health" { Invoke-RestMethod "$base/health" } | Out-Null

$listings = Show "GET /api/listings" { Invoke-RestMethod "$base/api/listings" }
Write-Host "       listings returned:" ($listings.data | Measure-Object).Count

$newListing = Show "POST /api/listings/create (landlord posts a room)" {
  Invoke-RestMethod -Method Post -Uri "$base/api/listings/create" -ContentType "application/json" -Body (@{
    title="Smoke Test Backroom"; suburb="Dobsonville"; monthlyRent=2200
    address="123 Smoke Test Street, Dobsonville"
    propertyType="Backroom"; description="Automated smoke test listing"
    landlordName="Smoke Tester"; landlordPhone="0821234567"; hasWhatsapp=$true
  } | ConvertTo-Json)
}
$listingId = $newListing.data._id
if (-not $listingId) { $listingId = $newListing.data.id }
Write-Host "       new listing id:" $listingId "status:" $newListing.data.status

$req = Show "POST /api/room-requests/create (tenant posts a request)" {
  Invoke-RestMethod -Method Post -Uri "$base/api/room-requests/create" -ContentType "application/json" -Body (@{
    seekerName="Smoke Tenant"; phone="0837654321"; suburb="Jabulani"
    maxBudget=1800; roomType="Backroom"; occupation="Student"
  } | ConvertTo-Json)
}
$reqId = $req.data.id; if (-not $reqId) { $reqId = $req.data._id }
Write-Host "       new request id:" $reqId "status:" $req.data.status

Show "GET /api/admin/stats (admin auth)" { Invoke-RestMethod "$base/api/admin/stats" -Headers $admin } | Out-Null

Show "admin sees pending listing" {
  $all = Invoke-RestMethod "$base/api/admin/listings" -Headers $admin
  Write-Host "       admin listings:" ($all.data | Measure-Object).Count
  $all
} | Out-Null

if ($listingId) {
  $appr = Show "admin APPROVE listing" {
    Invoke-RestMethod -Method Put -Uri "$base/api/admin/listings/$listingId/moderate" -Headers $admin -ContentType "application/json" -Body (@{ action="approve" } | ConvertTo-Json)
  }
  Write-Host "       status after approve:" $appr.data.status
}

Show "wrong admin key is rejected" {
  try {
    Invoke-RestMethod "$base/api/admin/stats" -Headers @{ "x-admin-key" = "Kgutlisiii1!" } | Out-Null
    throw "BACKDOOR STILL OPEN"
  } catch {
    if ($_.Exception.Message -eq "BACKDOOR STILL OPEN") { throw }
    "rejected as expected"
  }
} | Out-Null

Write-Host ""
Write-Host "Smoke test complete."
