# elaraSign Promote Preview to Live
#
# Shifts 100% traffic to the preview revision.
# Run this after testing the preview URL.
#
# USAGE:
# ======
# .\deploy-promote.ps1           # Promote preview to live
# .\deploy-promote.ps1 -Gradual  # Gradual rollout: 10% -> 50% -> 100%

param(
    [switch]$Gradual
)

$ErrorActionPreference = "Stop"

# Load config
$configPath = Join-Path $PSScriptRoot "deploy.config.json"
if (-not (Test-Path $configPath)) {
    Write-Host "ERROR: deploy.config.json not found" -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json

$gcloudConfig = $config.gcloud.configuration
$gcloudProject = $config.gcloud.project
$region = $config.gcloud.region
$serviceName = $config.service.name
$serviceDomain = $config.service.domain

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign PROMOTE to Live" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Activate gcloud config
$null = & gcloud config configurations activate $gcloudConfig 2>&1

# Check for preview revision file
$previewFile = Join-Path $PSScriptRoot ".preview-revision"
if (-not (Test-Path $previewFile)) {
    Write-Host "ERROR: No preview revision found." -ForegroundColor Red
    Write-Host "       Run deploy-preview.ps1 first." -ForegroundColor Red
    exit 1
}

$previewRevision = Get-Content $previewFile -Raw
$previewRevision = $previewRevision.Trim()

# Get current live revision
$liveRevision = & gcloud run services describe $serviceName --region=$region --format="value(status.traffic[0].revisionName)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^ERROR" }

Write-Host "  Preview revision: $previewRevision" -ForegroundColor Gray
Write-Host "  Current live:     $liveRevision" -ForegroundColor Gray
Write-Host ""

if ($previewRevision -eq $liveRevision) {
    Write-Host "Preview is already live. Nothing to do." -ForegroundColor Yellow
    exit 0
}

if ($Gradual) {
    # Gradual rollout: 10% -> 50% -> 100%
    Write-Host "GRADUAL ROLLOUT selected" -ForegroundColor Yellow
    Write-Host ""
    
    # Step 1: 10%
    Write-Host "[1/3] Routing 10% traffic to preview..." -ForegroundColor Yellow
    & gcloud run services update-traffic $serviceName --region=$region --to-revisions="$previewRevision=10,$liveRevision=90"
    Write-Host "      OK - 10% traffic to preview" -ForegroundColor Green
    Write-Host ""
    
    $continue = Read-Host "Check metrics. Continue to 50%? (yes/no)"
    if ($continue -ne "yes") {
        Write-Host "Stopped at 10%. Run deploy-rollback.ps1 to revert." -ForegroundColor Yellow
        exit 0
    }
    
    # Step 2: 50%
    Write-Host "[2/3] Routing 50% traffic to preview..." -ForegroundColor Yellow
    & gcloud run services update-traffic $serviceName --region=$region --to-revisions="$previewRevision=50,$liveRevision=50"
    Write-Host "      OK - 50% traffic to preview" -ForegroundColor Green
    Write-Host ""
    
    $continue = Read-Host "Check metrics. Continue to 100%? (yes/no)"
    if ($continue -ne "yes") {
        Write-Host "Stopped at 50%. Run deploy-rollback.ps1 to revert." -ForegroundColor Yellow
        exit 0
    }
    
    # Step 3: 100%
    Write-Host "[3/3] Routing 100% traffic to preview..." -ForegroundColor Yellow
}

# Confirm
Write-Host "This will route 100% traffic to: $previewRevision" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Type PROMOTE to confirm"
if ($confirm -ne "PROMOTE") {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

# Save current live for rollback
$liveRevision | Out-File -FilePath (Join-Path $PSScriptRoot ".last-live-revision") -NoNewline

# Promote
Write-Host ""
Write-Host "Promoting preview to live..." -ForegroundColor Yellow
& gcloud run services update-traffic $serviceName --region=$region --to-revisions=$previewRevision=100

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Promotion failed" -ForegroundColor Red
    exit 1
}

# Clean up preview file
Remove-Item $previewFile -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PROMOTED TO LIVE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Live URL: https://$serviceDomain" -ForegroundColor Cyan
Write-Host "  Revision: $previewRevision" -ForegroundColor White
Write-Host ""
Write-Host "  Previous: $liveRevision (saved for rollback)" -ForegroundColor Gray
Write-Host ""
Write-Host "  If issues: .\deploy-rollback.ps1" -ForegroundColor Yellow
Write-Host ""
