# elaraSign Deployment Script
#
# DEFAULT: Safe deployment with preview before going live
#
# WORKFLOW:
# =========
# 1. Build and deploy to Cloud Run with 0% traffic (preview)
# 2. Show preview URL for testing
# 3. Ask user to verify preview works
# 4. Only then route 100% traffic to new version
#
# OPTIONS:
#   -Direct      Skip preview, deploy directly to live (DANGEROUS)
#   -WithTests   Run tests before deploying
#   -LocalOnly   Build and run locally in Docker (no deploy)
#
# TRAFFIC MANAGEMENT:
# ===================
# For gradual rollouts (10% -> 50% -> 100%), use:
#   .\deploy-preview.ps1
#   .\deploy-promote.ps1 -Gradual

param(
    [switch]$Direct,
    [switch]$WithTests,
    [switch]$LocalOnly
)

$ErrorActionPreference = "Continue"

# Load config
$configPath = Join-Path $PSScriptRoot "deploy.config.json"
if (-not (Test-Path $configPath)) {
    Write-Host "ERROR: deploy.config.json not found" -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json

$gcloudConfig = $config.gcloud.configuration
$gcloudAccount = $config.gcloud.account
$gcloudProject = $config.gcloud.project
$serviceName = $config.service.name
$serviceDomain = $config.service.domain

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Config:  $gcloudConfig"
Write-Host "  Account: $gcloudAccount"
Write-Host "  Project: $gcloudProject"
Write-Host "  Service: $serviceName"
Write-Host "  Domain:  $serviceDomain"
Write-Host ""

# Step 1: Setup gcloud configuration
Write-Host "[1/6] Setting up gcloud configuration..." -ForegroundColor Yellow

$configs = & gcloud config configurations list --format="value(name)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^(Activated|Updated)" }
if ($configs -notcontains $gcloudConfig) {
    Write-Host "      Creating configuration: $gcloudConfig" -ForegroundColor Gray
    $null = & gcloud config configurations create $gcloudConfig 2>&1
}

$null = & gcloud config configurations activate $gcloudConfig 2>&1
$null = & gcloud config set account $gcloudAccount 2>&1
$null = & gcloud config set project $gcloudProject 2>&1

Write-Host "      OK - Configuration: $gcloudConfig" -ForegroundColor Green

# Step 2: Verify authentication
Write-Host "[2/6] Verifying authentication..." -ForegroundColor Yellow

$authList = & gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>&1 | Where-Object { $_ -is [string] }
if ($authList -notcontains $gcloudAccount) {
    Write-Host "      Account $gcloudAccount not authenticated." -ForegroundColor Red
    Write-Host "" 
    Write-Host "      Run this command to authenticate:" -ForegroundColor White
    Write-Host "" 
    Write-Host "        gcloud auth login $gcloudAccount" -ForegroundColor Cyan
    Write-Host "" 
    Write-Host "      Then re-run: .\deploy.ps1" -ForegroundColor White
    Write-Host "" 
    exit 1
}
Write-Host "      OK - Authenticated as $gcloudAccount" -ForegroundColor Green

# Step 3: Verify project access
Write-Host "[3/6] Verifying project access..." -ForegroundColor Yellow

$projectId = & gcloud projects describe $gcloudProject --format="value(projectId)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^ERROR" }
if ($projectId -ne $gcloudProject) {
    Write-Host "ERROR: Cannot access project $gcloudProject" -ForegroundColor Red
    exit 1
}
Write-Host "      OK - Project accessible" -ForegroundColor Green

# Step 4: Run tests (optional - trusts preflight by default)
if ($WithTests) {
    Write-Host "[4/7] Running tests (-WithTests)..." -ForegroundColor Yellow
    & npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Tests failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK - Tests passed" -ForegroundColor Green
} else {
    Write-Host "[4/7] Skipping tests (trusting preflight)" -ForegroundColor Yellow
    Write-Host "      TIP: Use -WithTests to run tests anyway" -ForegroundColor Gray
}

# Step 5: Build
Write-Host "[5/7] Building TypeScript..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "      OK - Build succeeded" -ForegroundColor Green

# Local only mode
if ($LocalOnly) {
    Write-Host "[6/7] Building local Docker..." -ForegroundColor Yellow
    & docker build -t elara-sign:local .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Docker build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "Starting local server at http://localhost:8080" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
    & docker run --rm -p 8080:8080 elara-sign:local
    exit 0
}

# Get current live revision (for traffic management)
Write-Host "[6/7] Recording current live revision..." -ForegroundColor Yellow
$region = $config.gcloud.region
$currentRevision = & gcloud run services describe $serviceName --region=$region --format="value(status.traffic[0].revisionName)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^ERROR" }
if ($currentRevision) {
    $currentRevision | Out-File -FilePath (Join-Path $PSScriptRoot ".last-live-revision") -NoNewline
    Write-Host "      OK - Current live: $currentRevision" -ForegroundColor Green
} else {
    Write-Host "      INFO - No existing revision (first deploy)" -ForegroundColor Gray
    $currentRevision = $null
}

# Step 7: Deploy
Write-Host "[7/7] Deploying to Cloud Run..." -ForegroundColor Yellow
Write-Host ""

$shortSha = & git rev-parse --short HEAD 2>&1 | Where-Object { $_ -is [string] }
if (-not $shortSha) { $shortSha = "manual" }

& gcloud builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA=$shortSha

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

# Get the new revision
Start-Sleep -Seconds 3
$newRevision = & gcloud run revisions list --service=$serviceName --region=$region --format="value(name)" --limit=1 2>&1 | Where-Object { $_ -is [string] }

if ($Direct) {
    # Direct mode: route traffic immediately
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  DEPLOYMENT SUCCESSFUL (-Direct)" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Live URL: https://$serviceDomain" -ForegroundColor White
    Write-Host "  Revision: $newRevision" -ForegroundColor Gray
    Write-Host ""
} else {
    # Default: Preview mode - set to 0% traffic first
    Write-Host ""
    Write-Host "Setting preview to 0% traffic..." -ForegroundColor Yellow
    
    if ($currentRevision) {
        & gcloud run services update-traffic $serviceName --region=$region --to-revisions="$currentRevision=100" 2>&1 | Out-Null
    }
    
    # Save for promote script
    $newRevision | Out-File -FilePath (Join-Path $PSScriptRoot ".preview-revision") -NoNewline
    
    # Get service URL (the new revision is deployed but at 0% traffic)
    $serviceUrl = & gcloud run services describe $serviceName --region=$region --format="value(status.url)" 2>&1 | Where-Object { $_ -is [string] }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  PREVIEW DEPLOYED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Revision: $newRevision (0% traffic)" -ForegroundColor Cyan
    Write-Host "  Live URL: https://$serviceDomain (unchanged)" -ForegroundColor White
    Write-Host ""
    Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Review Cloud Console to verify build succeeded" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. If ready, promote to live:" -ForegroundColor White
    Write-Host ""
    Write-Host "       .\deploy-promote.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. If something is wrong, do nothing." -ForegroundColor White
    Write-Host "     The live site is unchanged." -ForegroundColor White
    Write-Host ""
}
