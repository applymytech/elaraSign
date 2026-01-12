# elaraSign Forensic Master Key Setup
# ====================================
# Run this ONCE per project to set up forensic accountability.
# The key persists in Secret Manager across all deployments.

param(
    [string]$ProjectId = "elarasign-prod",
    [switch]$Force  # Overwrite existing key (DANGEROUS - orphans old signatures!)
)

$ErrorActionPreference = "Stop"
$SecretName = "elarasign-master-key"

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           elaraSign Forensic Master Key Setup                      ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  This key is used to encrypt accountability data in signed images  ║" -ForegroundColor Cyan
Write-Host "║  ONLY the holder of this key can decrypt forensic data later       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check gcloud
Write-Host "Checking gcloud configuration..." -ForegroundColor Yellow
$currentProject = gcloud config get-value project 2>$null
if ($currentProject -ne $ProjectId) {
    Write-Host "Setting project to $ProjectId..." -ForegroundColor Yellow
    gcloud config set project $ProjectId
}

# Check if secret already exists
Write-Host "Checking for existing secret..." -ForegroundColor Yellow
$existingSecret = gcloud secrets describe $SecretName --project=$ProjectId 2>$null

if ($existingSecret -and -not $Force) {
    Write-Host ""
    Write-Host "️  SECRET ALREADY EXISTS!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The master key is already configured in Secret Manager." -ForegroundColor White
    Write-Host "If you regenerate it, ALL previously signed images will have" -ForegroundColor White
    Write-Host "ORPHANED forensic data that can never be decrypted." -ForegroundColor White
    Write-Host ""
    Write-Host "View/copy in Google Console:" -ForegroundColor Gray
    Write-Host "  https://console.cloud.google.com/security/secret-manager/secret/$SecretName/versions?project=$ProjectId" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To force regeneration (DANGEROUS):" -ForegroundColor Red
    Write-Host "  .\setup-forensic-key.ps1 -Force" -ForegroundColor Red
    Write-Host ""
    exit 0
}

if ($Force -and $existingSecret) {
    Write-Host ""
    Write-Host "️  WARNING: You are about to REPLACE the existing master key!" -ForegroundColor Red
    Write-Host "   All previously signed images will have orphaned forensic data." -ForegroundColor Red
    Write-Host ""
    $confirm = Read-Host "Type 'REPLACE' to confirm"
    if ($confirm -ne "REPLACE") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 1
    }
}

# Generate new key
Write-Host ""
Write-Host "Generating 256-bit master key..." -ForegroundColor Yellow
$masterKey = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

if ($masterKey.Length -ne 64) {
    Write-Host "ERROR: Key generation failed" -ForegroundColor Red
    exit 1
}

# Store in Secret Manager
Write-Host "Storing in Google Secret Manager..." -ForegroundColor Yellow

if ($existingSecret) {
    # Add new version to existing secret
    $masterKey | gcloud secrets versions add $SecretName --data-file=- --project=$ProjectId
} else {
    # Create new secret
    $masterKey | gcloud secrets create $SecretName --data-file=- --project=$ProjectId --replication-policy="automatic"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to store secret" -ForegroundColor Red
    exit 1
}

# Grant Cloud Run service account access
Write-Host "Granting Cloud Run access to secret..." -ForegroundColor Yellow
$serviceAccount = "$(gcloud projects describe $ProjectId --format='value(projectNumber)')@compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding $SecretName `
    --member="serviceAccount:$serviceAccount" `
    --role="roles/secretmanager.secretAccessor" `
    --project=$ProjectId 2>$null

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                     SETUP COMPLETE                               ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Your master key is stored securely in Google Secret Manager." -ForegroundColor White
Write-Host ""
Write-Host "View/copy anytime:" -ForegroundColor Yellow
Write-Host "  https://console.cloud.google.com/security/secret-manager/secret/$SecretName/versions?project=$ProjectId" -ForegroundColor Cyan
Write-Host ""
Write-Host "(Click the secret version -> 'View Secret Value' to copy)" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy: gcloud builds submit --config=cloudbuild.yaml"
Write-Host ""
