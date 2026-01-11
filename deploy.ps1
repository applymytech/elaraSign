# elaraSign Deployment Script
# Reads all config from deploy.config.json

param(
    [switch]$SkipTests,
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
    Write-Host "      Account not authenticated. Opening browser..." -ForegroundColor Yellow
    & gcloud auth login $gcloudAccount
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Authentication failed" -ForegroundColor Red
        exit 1
    }
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

# Step 4: Run tests
if ($SkipTests) {
    Write-Host "[4/6] Skipping tests (-SkipTests)" -ForegroundColor Yellow
} else {
    Write-Host "[4/6] Running tests..." -ForegroundColor Yellow
    & npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Tests failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK - Tests passed" -ForegroundColor Green
}

# Step 5: Build
Write-Host "[5/6] Building TypeScript..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "      OK - Build succeeded" -ForegroundColor Green

# Local only mode
if ($LocalOnly) {
    Write-Host "[6/6] Building local Docker..." -ForegroundColor Yellow
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

# Step 6: Deploy
Write-Host "[6/6] Deploying to Cloud Run..." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Type DEPLOY to confirm"
if ($confirm -ne "DEPLOY") {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

$shortSha = & git rev-parse --short HEAD 2>&1 | Where-Object { $_ -is [string] }
if (-not $shortSha) { $shortSha = "manual" }

& gcloud builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA=$shortSha

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT SUCCESSFUL" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL: https://$serviceDomain" -ForegroundColor White
Write-Host ""
