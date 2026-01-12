# elaraSign Deployment Status
#
# Shows the commands to check deployment status.
# User runs the commands manually for full control.

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
Write-Host "  elaraSign - Deployment Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project: $gcloudProject" -ForegroundColor Gray
Write-Host "  Service: $serviceName" -ForegroundColor Gray
Write-Host "  Region:  $region" -ForegroundColor Gray
Write-Host "  Domain:  $serviceDomain" -ForegroundColor Gray
Write-Host ""

Write-Host "To check current traffic allocation:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  gcloud run services describe $serviceName --project=$gcloudProject --region=$region --format='table(status.traffic.revisionName,status.traffic.percent)'" -ForegroundColor Cyan
Write-Host ""

Write-Host "To list recent revisions:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  gcloud run revisions list --service=$serviceName --project=$gcloudProject --region=$region --limit=5" -ForegroundColor Cyan
Write-Host ""

Write-Host "To check service health:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  curl https://$serviceDomain/health" -ForegroundColor Cyan
Write-Host ""

Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  gcloud run services logs read $serviceName --project=$gcloudProject --region=$region --limit=50" -ForegroundColor Cyan
Write-Host ""

Write-Host "Console URLs:" -ForegroundColor Yellow
Write-Host "  Cloud Run:  https://console.cloud.google.com/run/detail/$region/$serviceName?project=$gcloudProject" -ForegroundColor Cyan
Write-Host "  Logs:       https://console.cloud.google.com/logs?project=$gcloudProject" -ForegroundColor Cyan
Write-Host ""

Write-Host "Live URL: https://$serviceDomain" -ForegroundColor Green
Write-Host ""
