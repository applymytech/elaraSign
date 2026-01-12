# elaraSign Promote Preview to Live
#
# Shows the commands to promote the preview revision to live.
# User runs the commands manually for full control.
#
# USAGE:
# ======
# .\deploy-promote.ps1

$ErrorActionPreference = "Stop"

# Load config
$configPath = Join-Path $PSScriptRoot "deploy.config.json"
if (-not (Test-Path $configPath)) {
    Write-Host "ERROR: deploy.config.json not found" -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json

$gcloudProject = $config.gcloud.project
$region = $config.gcloud.region
$serviceName = $config.service.name
$serviceDomain = $config.service.domain

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign - Promote to Live" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project: $gcloudProject" -ForegroundColor Gray
Write-Host "  Service: $serviceName" -ForegroundColor Gray
Write-Host "  Region:  $region" -ForegroundColor Gray
Write-Host "  Domain:  $serviceDomain" -ForegroundColor Gray
Write-Host ""

Write-Host "To promote the latest revision to 100% traffic, run:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  gcloud run services update-traffic $serviceName --project=$gcloudProject --region=$region --to-latest" -ForegroundColor Cyan
Write-Host ""

Write-Host "To check current traffic allocation:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  gcloud run services describe $serviceName --project=$gcloudProject --region=$region --format='table(status.traffic.revisionName,status.traffic.percent)'" -ForegroundColor Cyan
Write-Host ""

Write-Host "To rollback to a specific revision:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  gcloud run services update-traffic $serviceName --project=$gcloudProject --region=$region --to-revisions=REVISION_NAME=100" -ForegroundColor Cyan
Write-Host ""

Write-Host "Live URL: https://$serviceDomain" -ForegroundColor Green
Write-Host ""
