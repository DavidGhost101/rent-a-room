# Creates the app's Atlas database user and writes deploy\cloudrun-env.yaml.
#
# The password and JWT secrets are generated HERE, on this machine, written
# straight into the gitignored env file, and never printed. Nothing secret is
# echoed to the terminal or sent anywhere.

$ErrorActionPreference = "Stop"
$atlas   = "$env:LOCALAPPDATA\atlascli\bin\atlas.exe"
$project = "695c2f805fc129771d6d3d89"
$host_   = "cluster0.gjtnxct.mongodb.net"
$dbuser  = "rentaroom"

function New-Secret([int]$len) {
  $chars = [char[]]((48..57) + (65..90) + (97..122))
  -join (1..$len | ForEach-Object { $chars | Get-Random })
}

# Alphanumeric only, so it needs no percent-encoding inside the connection URI.
$pw         = New-Secret 32
$jwt        = New-Secret 64
$jwtRefresh = New-Secret 64
$adminKey   = New-Secret 28

Write-Host "Creating Atlas database user '$dbuser'..."
# Native commands write to stderr for harmless cases (e.g. "user not found" on a
# first run), and with ErrorActionPreference=Stop that aborts the script. Relax it
# around these two calls and judge success by the exit code instead.
$ErrorActionPreference = "Continue"
& $atlas dbusers delete $dbuser --projectId $project --force 2>&1 | Out-Null
& $atlas dbusers create --username $dbuser --password $pw --role readWriteAnyDatabase --projectId $project 2>&1 | Out-Null
$created = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($created -ne 0) { throw "Failed to create database user (exit $created)." }

$uri = "mongodb+srv://$dbuser`:$pw@$host_/rentaroom?retryWrites=true&w=majority&appName=Cluster0"

$yaml = @"
NODE_ENV: "production"
HOST: "0.0.0.0"
MONGODB_URI: "$uri"
JWT_SECRET: "$jwt"
JWT_REFRESH_SECRET: "$jwtRefresh"
JWT_EXPIRES_IN: "2h"
JWT_REFRESH_EXPIRES_IN: "7d"
ADMIN_KEY: "$adminKey"
SMS_DRIVER: "local"
TWILIO_ACCOUNT_SID: ""
TWILIO_AUTH_TOKEN: ""
TWILIO_PHONE_NUMBER: ""
TWILIO_VERIFY_SERVICE_SID: ""
TURNSTILE_SITE_KEY: ""
TURNSTILE_SECRET_KEY: ""
GEMINI_API_KEY: ""
EMAIL_FROM: "noreply@rentaroomsoweto.co.za"
"@

$out = Join-Path $PSScriptRoot "cloudrun-env.yaml"
Set-Content -Path $out -Value $yaml -Encoding UTF8
Write-Host "Wrote $out (gitignored)."

# Save the admin password on its own so you can find it without opening the yaml.
$adminOut = Join-Path $PSScriptRoot "ADMIN-PASSWORD.txt"
Set-Content -Path $adminOut -Value "Admin portal password for the deployed site:`r`n$adminKey`r`n`r`nKeep this file private. It is gitignored." -Encoding UTF8
Write-Host "Wrote $adminOut (gitignored)."
Write-Host ""
Write-Host "Done. Nothing secret was printed to this window."
