# elaraSign Deployment Status
#
# Shows current deployment state, traffic routing, and available revisions.

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
Write-Host "  elaraSign Deployment Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Activate gcloud config
$null = & gcloud config configurations activate $gcloudConfig 2>&1

# Get service info
Write-Host "SERVICE:" -ForegroundColor Yellow
Write-Host "  Name:    $serviceName" -ForegroundColor White
Write-Host "  Region:  $region" -ForegroundColor White
Write-Host "  URL:     https://$serviceDomain" -ForegroundColor Cyan
Write-Host ""

# Get traffic routing
Write-Host "TRAFFIC ROUTING:" -ForegroundColor Yellow
& gcloud run services describe $serviceName --region=$region --format="table(status.traffic[].revisionName,status.traffic[].percent)"
Write-Host ""

# Check for pending preview
$previewFile = Join-Path $PSScriptRoot ".preview-revision"
if (Test-Path $previewFile) {
    $previewRevision = (Get-Content $previewFile -Raw).Trim()
    $previewUrl = & gcloud run revisions describe $previewRevision --region=$region --format="value(status.url)" 2>&1 | Where-Object { $_ -is [string] }
    Write-Host "PENDING PREVIEW:" -ForegroundColor Yellow
    Write-Host "  Revision: $previewRevision" -ForegroundColor White
    Write-Host "  URL:      $previewUrl" -ForegroundColor Cyan
    Write-Host "  Action:   .\deploy-promote.ps1 to go live" -ForegroundColor Gray
    Write-Host ""
}

# Check for rollback target
$rollbackFile = Join-Path $PSScriptRoot ".last-live-revision"
if (Test-Path $rollbackFile) {
    $rollbackRevision = (Get-Content $rollbackFile -Raw).Trim()
    Write-Host "ROLLBACK TARGET:" -ForegroundColor Yellow
    Write-Host "  Revision: $rollbackRevision" -ForegroundColor White
    Write-Host "  Action:   .\deploy-rollback.ps1 to revert" -ForegroundColor Gray
    Write-Host ""
}

# Recent revisions
Write-Host "RECENT REVISIONS (last 5):" -ForegroundColor Yellow
& gcloud run revisions list --service=$serviceName --region=$region --format="table(name,metadata.creationTimestamp,status.conditions[0].status)" --limit=5
Write-Host ""

# Health check
Write-Host "HEALTH CHECK:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://$serviceDomain/health" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "  Status: HEALTHY" -ForegroundColor Green
        $healthData = $response.Content | ConvertFrom-Json
        Write-Host "  Build:  $($healthData.buildId)" -ForegroundColor Gray
    } else {
        Write-Host "  Status: UNHEALTHY (HTTP $($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "  Status: UNREACHABLE" -ForegroundColor Red
    Write-Host "  Error:  $($_.Exception.Message)" -ForegroundColor Gray
}
Write-Host ""
