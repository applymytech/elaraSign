# elaraSign Preflight Check
#
# WORKFLOW:
# =========
# 1. New user runs: .\preflight.ps1
#    - Creates gcloud configuration if needed
#    - Prompts for Google login if not authenticated
#    - Verifies project access
#    - Checks Node.js is installed
#
# 2. User runs: .\deploy.ps1
#    - Runs tests (catches broken code)
#    - Builds TypeScript
#    - Deploys to Cloud Run
#
# All config is read from deploy.config.json - no hardcoded values.

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

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign Preflight Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: gcloud CLI installed
Write-Host "[1/5] Checking gcloud CLI..." -ForegroundColor Yellow
$gcloudPath = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloudPath) {
    Write-Host "      OK - gcloud found at $($gcloudPath.Source)" -ForegroundColor Green
} else {
    Write-Host "      FAIL - gcloud not found" -ForegroundColor Red
    $allGood = $false
}

# Check 2: Configuration exists
Write-Host "[2/5] Checking gcloud configuration..." -ForegroundColor Yellow
$configs = & gcloud config configurations list --format="value(name)" 2>&1 | Where-Object { $_ -notmatch "^(Activated|Updated)" }
if ($configs -contains $gcloudConfig) {
    Write-Host "      OK - Configuration '$gcloudConfig' exists" -ForegroundColor Green
} else {
    Write-Host "      INFO - Configuration '$gcloudConfig' will be created" -ForegroundColor Yellow
}

# Check 3: Account authenticated
Write-Host "[3/5] Checking authentication..." -ForegroundColor Yellow
$authAccounts = & gcloud auth list --format="value(account)" 2>&1 | Where-Object { $_ -notmatch "^(Activated|Updated)" }
if ($authAccounts -contains $gcloudAccount) {
    Write-Host "      OK - Account $gcloudAccount is authenticated" -ForegroundColor Green
} else {
    Write-Host "      WARN - Account $gcloudAccount not authenticated" -ForegroundColor Yellow
    Write-Host "            Deploy script will prompt for login" -ForegroundColor Gray
}

# Check 4: Activate config and check project
Write-Host "[4/5] Checking project access..." -ForegroundColor Yellow
$null = & gcloud config configurations activate $gcloudConfig 2>&1
$null = & gcloud config set account $gcloudAccount 2>&1
$null = & gcloud config set project $gcloudProject 2>&1

$projectId = & gcloud projects describe $gcloudProject --format="value(projectId)" 2>&1 | Where-Object { $_ -notmatch "^(Activated|Updated|ERROR)" }
if ($projectId -eq $gcloudProject) {
    Write-Host "      OK - Project $gcloudProject accessible" -ForegroundColor Green
} else {
    Write-Host "      FAIL - Cannot access project $gcloudProject" -ForegroundColor Red
    $allGood = $false
}

# Check 5: Node.js
Write-Host "[5/5] Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = & node --version 2>&1
if ($nodeVersion -match "^v\d+") {
    Write-Host "      OK - Node.js $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "      FAIL - Node.js not found" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
if ($allGood) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Ready to deploy: .\deploy.ps1" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  SOME CHECKS FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    exit 1
}
