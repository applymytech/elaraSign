# elaraSign Emergency Rollback
#
# Instantly reverts traffic to the previous live revision.
# Use this if issues are discovered after promotion.
#
# USAGE:
# ======
# .\deploy-rollback.ps1              # Rollback to previous
# .\deploy-rollback.ps1 -List        # Show available revisions
# .\deploy-rollback.ps1 -To <name>   # Rollback to specific revision

param(
    [switch]$List,
    [string]$To
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
Write-Host "========================================" -ForegroundColor Red
Write-Host "  elaraSign EMERGENCY ROLLBACK" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# Activate gcloud config
$null = & gcloud config configurations activate $gcloudConfig 2>&1

# List mode
if ($List) {
    Write-Host "Available revisions:" -ForegroundColor Yellow
    Write-Host ""
    & gcloud run revisions list --service=$serviceName --region=$region --format="table(name,status.conditions[0].status,metadata.creationTimestamp)"
    Write-Host ""
    Write-Host "Usage: .\deploy-rollback.ps1 -To <revision-name>" -ForegroundColor Gray
    exit 0
}

# Get current live revision
$currentRevision = & gcloud run services describe $serviceName --region=$region --format="value(status.traffic[0].revisionName)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^ERROR" }
Write-Host "  Current live: $currentRevision" -ForegroundColor Gray

# Determine target revision
if ($To) {
    $targetRevision = $To
} else {
    # Use saved previous revision
    $rollbackFile = Join-Path $PSScriptRoot ".last-live-revision"
    if (-not (Test-Path $rollbackFile)) {
        Write-Host "ERROR: No previous revision saved." -ForegroundColor Red
        Write-Host "       Use -List to see available revisions," -ForegroundColor Red
        Write-Host "       then -To <name> to specify target." -ForegroundColor Red
        exit 1
    }
    $targetRevision = (Get-Content $rollbackFile -Raw).Trim()
}

Write-Host "  Target:       $targetRevision" -ForegroundColor Gray
Write-Host ""

if ($currentRevision -eq $targetRevision) {
    Write-Host "Already on target revision. Nothing to do." -ForegroundColor Yellow
    exit 0
}

# Verify target exists
$targetExists = & gcloud run revisions describe $targetRevision --region=$region --format="value(name)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^ERROR" }
if (-not $targetExists) {
    Write-Host "ERROR: Revision '$targetRevision' not found." -ForegroundColor Red
    Write-Host "       Use -List to see available revisions." -ForegroundColor Red
    exit 1
}

# Confirm
Write-Host "This will IMMEDIATELY route 100% traffic to: $targetRevision" -ForegroundColor Red
Write-Host ""
$confirm = Read-Host "Type ROLLBACK to confirm"
if ($confirm -ne "ROLLBACK") {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

# Execute rollback
Write-Host ""
Write-Host "Rolling back..." -ForegroundColor Yellow
& gcloud run services update-traffic $serviceName --region=$region --to-revisions=$targetRevision=100

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Rollback failed" -ForegroundColor Red
    exit 1
}

# Save current as rollback target (in case we need to roll forward)
$currentRevision | Out-File -FilePath (Join-Path $PSScriptRoot ".last-live-revision") -NoNewline

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ROLLBACK COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Live URL: https://$serviceDomain" -ForegroundColor Cyan
Write-Host "  Revision: $targetRevision" -ForegroundColor White
Write-Host ""
Write-Host "  Previous revision saved (can roll forward if needed)" -ForegroundColor Gray
Write-Host ""
