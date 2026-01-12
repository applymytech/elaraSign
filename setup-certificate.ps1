<#
.SYNOPSIS
    elaraSign Certificate Setup - Creates and deploys the service signing certificate

.DESCRIPTION
    This script handles the P12 certificate lifecycle for elaraSign:
    1. Generates a self-signed certificate (or imports your CA-signed one)
    2. Uploads to Google Secret Manager
    3. Configures Cloud Run to use it
    4. Cleans up local secrets (with user confirmation)

    THE WITNESS MODEL:
    elaraSign acts as a WITNESS to signing events. The service certificate
    proves WHICH elaraSign instance witnessed the signing. This is different
    from signing AS the user - we sign as the witness TO the user's request.

.PARAMETER ImportP12
    Path to an existing P12 certificate to import (from a CA)

.PARAMETER GenerateSelfSigned
    Generate a new self-signed certificate (default if no import)

.PARAMETER Force
    Skip confirmation prompts

.NOTES
    Run this AFTER first-time-setup.ps1 and BEFORE first deployment.
    The certificate only needs to be created ONCE per service instance.
#>

param(
    [string]$ImportP12,
    [switch]$GenerateSelfSigned,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# ============================================================================
# CONFIGURATION
# ============================================================================

$CERT_DIR = Join-Path $PSScriptRoot "certs"
$P12_FILE = Join-Path $CERT_DIR "service.p12"
$PASSWORD_FILE = Join-Path $CERT_DIR "service.password"
$BACKUP_DIR = Join-Path $PSScriptRoot "certs-backup"

# Secret Manager secret names
$SECRET_P12 = "elarasign-p12-certificate"
$SECRET_PASSWORD = "elarasign-p12-password"

# ============================================================================
# HELPERS
# ============================================================================

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "▶ $Message" -ForegroundColor Cyan
    Write-Host "  $("-" * 70)" -ForegroundColor DarkGray
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "  ℹ️  $Message" -ForegroundColor Gray
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠️  $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ❌ $Message" -ForegroundColor Red
}

function Confirm-Action {
    param([string]$Message)
    if ($Force) { return $true }
    
    $response = Read-Host "  $Message [y/N]"
    return $response -match "^[Yy]"
}

# ============================================================================
# LOAD DEPLOY CONFIG
# ============================================================================

Write-Step "Loading configuration"

$configPath = Join-Path $PSScriptRoot "deploy.config.json"
if (-not (Test-Path $configPath)) {
    Write-Fail "deploy.config.json not found!"
    Write-Host "  Run .\first-time-setup.ps1 first" -ForegroundColor Yellow
    exit 1
}

$config = Get-Content $configPath | ConvertFrom-Json
$PROJECT_ID = $config.gcloud.project
$REGION = $config.gcloud.region
$SERVICE_NAME = $config.service.name

# Get identity info (for certificate CN)
$ORG_NAME = if ($config.identity.organizationName) { $config.identity.organizationName } else { "elaraSign Service" }
$SERVICE_EMAIL = if ($config.identity.serviceEmail) { $config.identity.serviceEmail } else { "signing@openelara.org" }

Write-Success "Project: $PROJECT_ID"
Write-Success "Region: $REGION"
Write-Success "Organization: $ORG_NAME"

# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

Write-Step "Checking prerequisites"

# Check gcloud
try {
    $gcloudVersion = gcloud --version 2>&1 | Select-Object -First 1
    Write-Success "gcloud CLI: $gcloudVersion"
} catch {
    Write-Fail "gcloud CLI not found. Install from https://cloud.google.com/sdk"
    exit 1
}

# Check project access
$currentProject = gcloud config get-value project 2>$null
if ($currentProject -ne $PROJECT_ID) {
    Write-Info "Switching to project $PROJECT_ID"
    gcloud config set project $PROJECT_ID 2>$null
}

# Check Secret Manager API is enabled
Write-Info "Checking Secret Manager API..."
$apiEnabled = gcloud services list --enabled --filter="name:secretmanager.googleapis.com" --format="value(name)" 2>$null
if (-not $apiEnabled) {
    Write-Info "Enabling Secret Manager API..."
    gcloud services enable secretmanager.googleapis.com
    Write-Success "Secret Manager API enabled"
} else {
    Write-Success "Secret Manager API is enabled"
}

# ============================================================================
# CERTIFICATE GENERATION OR IMPORT
# ============================================================================

Write-Step "Certificate Setup"

# Create certs directory
if (-not (Test-Path $CERT_DIR)) {
    New-Item -ItemType Directory -Path $CERT_DIR -Force | Out-Null
    Write-Info "Created $CERT_DIR"
}

if ($ImportP12) {
    # Import existing certificate
    if (-not (Test-Path $ImportP12)) {
        Write-Fail "Certificate file not found: $ImportP12"
        exit 1
    }
    
    Write-Info "Importing existing P12 certificate..."
    Copy-Item $ImportP12 $P12_FILE -Force
    
    $password = Read-Host "  Enter the P12 password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    $plainPassword | Set-Content $PASSWORD_FILE
    
    Write-Success "Certificate imported"
}
elseif ((Test-Path $P12_FILE) -and (Test-Path $PASSWORD_FILE)) {
    # Certificate already exists locally
    Write-Info "Found existing certificate at $P12_FILE"
    
    if (-not (Confirm-Action "Use existing certificate?")) {
        Write-Info "Generating new certificate..."
        $generateNew = $true
    }
}
else {
    # Generate new self-signed certificate
    $generateNew = $true
}

if ($generateNew -or $GenerateSelfSigned) {
    Write-Info "Generating self-signed P12 certificate..."
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "  ║  CERTIFICATE DETAILS                                             ║" -ForegroundColor Yellow
    Write-Host "  ║                                                                  ║" -ForegroundColor Yellow
    Write-Host "  ║  Organization: $($ORG_NAME.PadRight(46))║" -ForegroundColor Yellow
    Write-Host "  ║  Email:        $($SERVICE_EMAIL.PadRight(46))║" -ForegroundColor Yellow
    Write-Host "  ║                                                                  ║" -ForegroundColor Yellow
    Write-Host "  ║  This is a SELF-SIGNED certificate.                              ║" -ForegroundColor Yellow
    Write-Host "  ║  Adobe will show: 'Signature validity is UNKNOWN'                ║" -ForegroundColor Yellow
    Write-Host "  ║                                                                  ║" -ForegroundColor Yellow
    Write-Host "  ║  For Adobe-trusted signatures, use a CA-signed certificate.      ║" -ForegroundColor Yellow
    Write-Host "  ╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""
    
    # Generate certificate using Node.js (our existing function)
    $generateScript = @"
const crypto = require('crypto');
const forge = require('node-forge');

// Configuration
const commonName = '$ORG_NAME';
const email = '$SERVICE_EMAIL';
const password = crypto.randomBytes(32).toString('hex');

// Generate key pair
const keys = forge.pki.rsa.generateKeyPair(2048);

// Create certificate
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = Date.now().toString(16);
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

// Set subject/issuer
const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'emailAddress', value: email },
    { name: 'organizationName', value: commonName },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);

// Add extensions
cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', emailProtection: true },
]);

// Self-sign
cert.sign(keys.privateKey, forge.md.sha256.create());

// Create PKCS#12
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

// Output as JSON
console.log(JSON.stringify({
    p12: Buffer.from(p12Der, 'binary').toString('base64'),
    password: password
}));
"@
    
    $generateScript | Set-Content (Join-Path $CERT_DIR "generate.js")
    
    Push-Location $PSScriptRoot
    try {
        $result = node (Join-Path $CERT_DIR "generate.js") 2>&1
        $certData = $result | ConvertFrom-Json
        
        # Save P12
        [Convert]::FromBase64String($certData.p12) | Set-Content $P12_FILE -Encoding Byte
        
        # Save password
        $certData.password | Set-Content $PASSWORD_FILE
        
        # Clean up generate script
        Remove-Item (Join-Path $CERT_DIR "generate.js") -Force
        
        Write-Success "Certificate generated successfully"
        Write-Info "Fingerprint: $((Get-FileHash $P12_FILE -Algorithm SHA256).Hash.Substring(0, 32))"
    }
    catch {
        Write-Fail "Failed to generate certificate: $_"
        exit 1
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# UPLOAD TO SECRET MANAGER
# ============================================================================

Write-Step "Uploading to Google Secret Manager"

Write-Host ""
Write-Host "  Secrets will be stored in project: $PROJECT_ID" -ForegroundColor Gray
Write-Host "  - $SECRET_P12 (the P12 certificate)" -ForegroundColor Gray
Write-Host "  - $SECRET_PASSWORD (the password)" -ForegroundColor Gray
Write-Host ""

if (-not (Confirm-Action "Upload certificate to Secret Manager?")) {
    Write-Warn "Skipping Secret Manager upload"
    Write-Host "  You'll need to manually set environment variables for Cloud Run" -ForegroundColor Yellow
}
else {
    # Create or update P12 secret
    Write-Info "Uploading P12 certificate..."
    
    # Check if secret exists
    $secretExists = gcloud secrets describe $SECRET_P12 --project=$PROJECT_ID 2>$null
    
    if ($secretExists) {
        # Add new version
        $p12Base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($P12_FILE))
        $p12Base64 | gcloud secrets versions add $SECRET_P12 --project=$PROJECT_ID --data-file=-
        Write-Success "Updated $SECRET_P12 (new version)"
    }
    else {
        # Create secret
        gcloud secrets create $SECRET_P12 --project=$PROJECT_ID --replication-policy="automatic"
        $p12Base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($P12_FILE))
        $p12Base64 | gcloud secrets versions add $SECRET_P12 --project=$PROJECT_ID --data-file=-
        Write-Success "Created $SECRET_P12"
    }
    
    # Create or update password secret
    Write-Info "Uploading password..."
    
    $passwordExists = gcloud secrets describe $SECRET_PASSWORD --project=$PROJECT_ID 2>$null
    
    if ($passwordExists) {
        Get-Content $PASSWORD_FILE | gcloud secrets versions add $SECRET_PASSWORD --project=$PROJECT_ID --data-file=-
        Write-Success "Updated $SECRET_PASSWORD (new version)"
    }
    else {
        gcloud secrets create $SECRET_PASSWORD --project=$PROJECT_ID --replication-policy="automatic"
        Get-Content $PASSWORD_FILE | gcloud secrets versions add $SECRET_PASSWORD --project=$PROJECT_ID --data-file=-
        Write-Success "Created $SECRET_PASSWORD"
    }
    
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "  ║  VERIFY IN CONSOLE                                               ║" -ForegroundColor Green
    Write-Host "  ╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Please verify the secrets were created:" -ForegroundColor White
    Write-Host ""
    Write-Host "  https://console.cloud.google.com/security/secret-manager?project=$PROJECT_ID" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  You should see:" -ForegroundColor Gray
    Write-Host "    - $SECRET_P12" -ForegroundColor Gray
    Write-Host "    - $SECRET_PASSWORD" -ForegroundColor Gray
    Write-Host ""
    
    $verified = Confirm-Action "Have you verified the secrets in the console?"
    if (-not $verified) {
        Write-Warn "Please verify before continuing"
    }
}

# ============================================================================
# CLEAN UP LOCAL SECRETS
# ============================================================================

Write-Step "Local Secret Cleanup"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "  ║  IMPORTANT: Local Secret Handling                                ║" -ForegroundColor Yellow
Write-Host "  ╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""
Write-Host "  The P12 certificate and password are stored locally at:" -ForegroundColor Gray
Write-Host "    $P12_FILE" -ForegroundColor White
Write-Host "    $PASSWORD_FILE" -ForegroundColor White
Write-Host ""
Write-Host "  These files are in .gitignore and will NOT be committed." -ForegroundColor Green
Write-Host ""
Write-Host "  Options:" -ForegroundColor White
Write-Host "    1. KEEP locally (useful for local development)" -ForegroundColor Gray
Write-Host "    2. BACKUP to secure location, then delete" -ForegroundColor Gray
Write-Host "    3. DELETE immediately (secrets are in Secret Manager)" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "  Choose [1/2/3] (default: 1)"

switch ($choice) {
    "2" {
        # Backup
        if (-not (Test-Path $BACKUP_DIR)) {
            New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
        }
        
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupPath = Join-Path $BACKUP_DIR "backup-$timestamp"
        New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
        
        Copy-Item $P12_FILE $backupPath
        Copy-Item $PASSWORD_FILE $backupPath
        
        Write-Success "Backed up to: $backupPath"
        Write-Warn "Move this backup to a SECURE OFFLINE location!"
        Write-Warn "Do NOT leave in the repository!"
        
        if (Confirm-Action "Delete original files now?") {
            Remove-Item $P12_FILE -Force
            Remove-Item $PASSWORD_FILE -Force
            Write-Success "Local files deleted"
        }
    }
    "3" {
        # Delete
        if (Confirm-Action "Are you SURE? This cannot be undone!") {
            Remove-Item $P12_FILE -Force
            Remove-Item $PASSWORD_FILE -Force
            Write-Success "Local files deleted"
            Write-Info "Certificate is safely stored in Secret Manager"
        }
    }
    default {
        Write-Info "Keeping local files"
        Write-Host "  Remember: These are ignored by git but still on your disk" -ForegroundColor Gray
    }
}

# ============================================================================
# UPDATE CLOUD RUN CONFIGURATION
# ============================================================================

Write-Step "Cloud Run Configuration"

Write-Host ""
Write-Host "  To use the certificate, Cloud Run needs these environment variables:" -ForegroundColor White
Write-Host ""
Write-Host "    ELARASIGN_P12_BASE64   = (from Secret Manager: $SECRET_P12)" -ForegroundColor Gray
Write-Host "    ELARASIGN_P12_PASSWORD = (from Secret Manager: $SECRET_PASSWORD)" -ForegroundColor Gray
Write-Host ""
Write-Host "  These will be configured automatically during deployment." -ForegroundColor Green
Write-Host ""

# Check if cloudbuild.yaml exists and has the secrets configured
$cloudbuildPath = Join-Path $PSScriptRoot "cloudbuild.yaml"
if (Test-Path $cloudbuildPath) {
    $cloudbuild = Get-Content $cloudbuildPath -Raw
    
    if ($cloudbuild -notmatch "ELARASIGN_P12_BASE64") {
        Write-Warn "cloudbuild.yaml may need updating to include secret references"
        Write-Host "  Add these to the Cloud Run deploy step:" -ForegroundColor Gray
        Write-Host ""
        Write-Host "    --set-secrets=ELARASIGN_P12_BASE64=$SECRET_P12`:latest" -ForegroundColor Cyan
        Write-Host "    --set-secrets=ELARASIGN_P12_PASSWORD=$SECRET_PASSWORD`:latest" -ForegroundColor Cyan
        Write-Host ""
    }
    else {
        Write-Success "cloudbuild.yaml appears to have secret configuration"
    }
}

# ============================================================================
# DONE
# ============================================================================

Write-Host ""
Write-Host "  =======================================================================" -ForegroundColor Green
Write-Host "  ║  Certificate Setup Complete!                                        ║" -ForegroundColor Green
Write-Host "  =======================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  What's next?" -ForegroundColor White
Write-Host ""
Write-Host "    1. Deploy to Cloud Run:  .\deploy.ps1" -ForegroundColor Cyan
Write-Host "    2. Test PDF signing with your new certificate" -ForegroundColor Gray
Write-Host "    3. PDFs will show 'Digitally signed by $ORG_NAME'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Certificate fingerprint (for reference):" -ForegroundColor Gray
if (Test-Path $P12_FILE) {
    Write-Host "    $((Get-FileHash $P12_FILE -Algorithm SHA256).Hash.Substring(0, 32))" -ForegroundColor DarkGray
}
Write-Host ""
