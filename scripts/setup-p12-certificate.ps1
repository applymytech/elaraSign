# elaraSign P12 Certificate Setup
# ================================
#
# Creates a self-signed P12 certificate and uploads to Google Secret Manager.
# Uses OpenSSL bundled with Git for Windows (no extra installs needed).
#
# USAGE:
#   .\scripts\setup-p12-certificate.ps1
#
# PREREQUISITES:
#   - Git for Windows (you used it to clone this repo!)
#   - gcloud CLI authenticated
#   - deploy.config.json exists (run first-time-setup.ps1 first)

param(
    [switch]$Force,
    [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"

# ============================================================================
# FIND OPENSSL (bundled with Git for Windows)
# ============================================================================

$OPENSSL = $null

# Common Git installation paths
$gitPaths = @(
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files (x86)\Git\usr\bin\openssl.exe",
    "$env:LOCALAPPDATA\Programs\Git\usr\bin\openssl.exe"
)

foreach ($path in $gitPaths) {
    if (Test-Path $path) {
        $OPENSSL = $path
        break
    }
}

if (-not $OPENSSL) {
    Write-Host ""
    Write-Host "ERROR: OpenSSL not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "OpenSSL is bundled with Git for Windows." -ForegroundColor Yellow
    Write-Host "Since you cloned this repo, you should have Git installed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Expected location: C:\Program Files\Git\usr\bin\openssl.exe" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Try running: git --version" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign P12 Certificate Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Using OpenSSL: $OPENSSL" -ForegroundColor Gray

# ============================================================================
# LOAD CONFIG
# ============================================================================

$configPath = Join-Path $PSScriptRoot "..\deploy.config.json"
if (-not (Test-Path $configPath)) {
    Write-Host ""
    Write-Host "ERROR: deploy.config.json not found!" -ForegroundColor Red
    Write-Host "       Run .\first-time-setup.ps1 first" -ForegroundColor Yellow
    exit 1
}

$config = Get-Content $configPath | ConvertFrom-Json
$PROJECT_ID = $config.gcloud.project
$ORG_NAME = if ($config.identity.organizationName) { $config.identity.organizationName } else { "elaraSign Service" }
$SERVICE_EMAIL = if ($config.identity.serviceEmail) { $config.identity.serviceEmail } else { "signing@openelara.org" }

Write-Host "  Project: $PROJECT_ID" -ForegroundColor Gray
Write-Host "  Organization: $ORG_NAME" -ForegroundColor Gray
Write-Host "  Email: $SERVICE_EMAIL" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# CREATE CERTIFICATE
# ============================================================================

$CERT_DIR = Join-Path $PSScriptRoot "..\certs"
if (-not (Test-Path $CERT_DIR)) {
    New-Item -ItemType Directory -Path $CERT_DIR -Force | Out-Null
}

$P12_FILE = Join-Path $CERT_DIR "service.p12"
$PASSWORD_FILE = Join-Path $CERT_DIR "service.password"
$KEY_FILE = Join-Path $CERT_DIR "key.pem"
$CERT_FILE = Join-Path $CERT_DIR "cert.pem"

# Check if already exists
if ((Test-Path $P12_FILE) -and -not $Force) {
    Write-Host "Certificate already exists at: $P12_FILE" -ForegroundColor Yellow
    Write-Host "Use -Force to regenerate" -ForegroundColor Gray
    Write-Host ""
    
    $response = Read-Host "Continue with existing certificate? [Y/n]"
    if ($response -match "^[Nn]") {
        exit 0
    }
}
else {
    Write-Host "[1/4] Generating password..." -ForegroundColor Yellow
    
    # Generate a random password (64 hex chars)
    $PASSWORD = -join ((48..57) + (65..70) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    $PASSWORD | Out-File -FilePath $PASSWORD_FILE -NoNewline -Encoding ASCII
    Write-Host "      OK" -ForegroundColor Green

    Write-Host "[2/4] Generating private key + certificate..." -ForegroundColor Yellow
    
    # Subject for certificate
    $SUBJECT = "/CN=$ORG_NAME/O=$ORG_NAME/emailAddress=$SERVICE_EMAIL"
    
    # Generate private key + self-signed certificate (valid 2 years)
    & $OPENSSL req -x509 -newkey rsa:2048 -keyout $KEY_FILE -out $CERT_FILE -days 730 -nodes -subj $SUBJECT 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      FAILED" -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK" -ForegroundColor Green

    Write-Host "[3/4] Creating P12 bundle..." -ForegroundColor Yellow
    
    # Create P12 (PKCS#12) file
    & $OPENSSL pkcs12 -export -out $P12_FILE -inkey $KEY_FILE -in $CERT_FILE -password pass:$PASSWORD 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      FAILED" -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK" -ForegroundColor Green

    Write-Host "[4/4] Cleaning up intermediate files..." -ForegroundColor Yellow
    Remove-Item $KEY_FILE -Force -ErrorAction SilentlyContinue
    Remove-Item $CERT_FILE -Force -ErrorAction SilentlyContinue
    Write-Host "      OK" -ForegroundColor Green

    Write-Host ""
    Write-Host "Certificate created:" -ForegroundColor Green
    Write-Host "  P12: $P12_FILE" -ForegroundColor White
    Write-Host "  Password: $PASSWORD_FILE" -ForegroundColor White
}

# ============================================================================
# UPLOAD TO SECRET MANAGER
# ============================================================================

if ($SkipUpload) {
    Write-Host ""
    Write-Host "Skipping Secret Manager upload (-SkipUpload)" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Uploading to Secret Manager" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$SECRET_P12 = "elarasign-p12-certificate"
$SECRET_PASSWORD = "elarasign-p12-password"

# Activate gcloud config if set
if ($config.gcloud.configuration) {
    $null = gcloud config configurations activate $config.gcloud.configuration 2>&1
}

# Read password
$PASSWORD = Get-Content $PASSWORD_FILE -Raw

# Create Base64 of P12
$P12_BASE64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($P12_FILE))

# Function to create or update a secret
function Set-Secret {
    param(
        [string]$Name,
        [string]$Value
    )
    
    # Check if exists
    $exists = gcloud secrets describe $Name --project=$PROJECT_ID 2>$null
    
    if ($exists) {
        Write-Host "  Updating $Name..." -ForegroundColor Yellow
        $Value | gcloud secrets versions add $Name --project=$PROJECT_ID --data-file=- 2>$null
    }
    else {
        Write-Host "  Creating $Name..." -ForegroundColor Yellow
        gcloud secrets create $Name --project=$PROJECT_ID --replication-policy="automatic" 2>$null
        $Value | gcloud secrets versions add $Name --project=$PROJECT_ID --data-file=- 2>$null
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      OK" -ForegroundColor Green
    }
    else {
        Write-Host "      FAILED" -ForegroundColor Red
    }
}

Set-Secret -Name $SECRET_P12 -Value $P12_BASE64
Set-Secret -Name $SECRET_PASSWORD -Value $PASSWORD

# ============================================================================
# GRANT ACCESS TO CLOUD RUN
# ============================================================================

Write-Host ""
Write-Host "Granting Cloud Run access to secrets..." -ForegroundColor Yellow

$projectNumber = gcloud projects describe $PROJECT_ID --format="value(projectNumber)" 2>$null
$serviceAccount = "$projectNumber-compute@developer.gserviceaccount.com"

Write-Host "  Service account: $serviceAccount" -ForegroundColor Gray

foreach ($secret in @($SECRET_P12, $SECRET_PASSWORD)) {
    gcloud secrets add-iam-policy-binding $secret `
        --member="serviceAccount:$serviceAccount" `
        --role="roles/secretmanager.secretAccessor" `
        --project=$PROJECT_ID 2>$null | Out-Null
}
Write-Host "      OK" -ForegroundColor Green

# ============================================================================
# DONE
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Certificate Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Secrets created in ${PROJECT_ID}:" -ForegroundColor White
Write-Host "    - ${SECRET_P12}" -ForegroundColor Gray
Write-Host "    - ${SECRET_PASSWORD}" -ForegroundColor Gray
Write-Host ""
Write-Host "  NEXT: Update cloudbuild.yaml to use these secrets," -ForegroundColor Yellow
Write-Host "        then redeploy with: .\deploy.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Verify in console:" -ForegroundColor Gray
Write-Host "  https://console.cloud.google.com/security/secret-manager?project=$PROJECT_ID" -ForegroundColor Cyan
Write-Host ""
