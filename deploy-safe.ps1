<#
.SYNOPSIS
    Safe deployment script for elaraSign with account verification

.DESCRIPTION
    Deploys elaraSign to Google Cloud Run with multiple safety checks.
    ALL configuration is read from deploy.config.json - NO HARDCODED VALUES.

.NOTES
    Configuration: deploy.config.json
    
.EXAMPLE
    .\deploy-safe.ps1
    .\deploy-safe.ps1 -SkipTests
    .\deploy-safe.ps1 -LocalOnly
#>

param(
    [switch]$SkipTests,
    [switch]$LocalOnly,
    [switch]$Force
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Suppress gcloud stderr warnings
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = "1"

# ============================================================================
# LOAD CONFIGURATION (NO HARDCODED VALUES)
# ============================================================================

$configPath = Join-Path $PSScriptRoot "deploy.config.json"

if (-not (Test-Path $configPath)) {
    Write-Host "[FATAL] deploy.config.json not found!" -ForegroundColor Red
    Write-Host "        Expected at: $configPath" -ForegroundColor Gray
    Write-Host "        This file MUST exist. No hardcoded fallbacks." -ForegroundColor Yellow
    exit 1
}

try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "[FATAL] Failed to parse deploy.config.json" -ForegroundColor Red
    Write-Host "        Error: $_" -ForegroundColor Gray
    exit 1
}

# Extract config values (fail if missing)
function Get-RequiredConfig {
    param([string]$Path)
    
    $parts = $Path -split '\.'
    $value = $config
    foreach ($part in $parts) {
        $value = $value.$part
        if ($null -eq $value) {
            Write-Host "[FATAL] Missing required config: $Path" -ForegroundColor Red
            exit 1
        }
    }
    return $value
}

$EXPECTED_CONFIG = Get-RequiredConfig "gcloud.configuration"
$EXPECTED_ACCOUNT = Get-RequiredConfig "gcloud.account"
$EXPECTED_PROJECT = Get-RequiredConfig "gcloud.project"
$SERVICE_NAME = Get-RequiredConfig "service.name"
$REGION = Get-RequiredConfig "service.region"
$DOMAIN = Get-RequiredConfig "service.domain"
$BANNED_PATTERNS = $config.banned.patterns

if (-not $BANNED_PATTERNS -or $BANNED_PATTERNS.Count -eq 0) {
    Write-Host "[WARN] No banned patterns configured" -ForegroundColor Yellow
}

# ============================================================================
# BANNER
# ============================================================================

Clear-Host
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "                    elaraSign Safe Deployment                           " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Config: deploy.config.json" -ForegroundColor Gray
Write-Host "   Target: $DOMAIN" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# STEP 0: CONTAMINATION CHECK (CRITICAL - RUN FIRST)
# ============================================================================

Write-Host "[0] Contamination Check" -ForegroundColor Red

$currentConfig = (gcloud config configurations list --filter="is_active=true" --format="value(name)" 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()
$currentAccount = (gcloud config get-value account 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()
$currentProject = (gcloud config get-value project 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()

$allSettings = "$currentConfig $currentAccount $currentProject"
foreach ($banned in $BANNED_PATTERNS) {
    if ($allSettings -match $banned) {
        Write-Host ""
        Write-Host "    +================================================================+" -ForegroundColor Red
        Write-Host "    | CONTAMINATION DETECTED: '$banned'" -ForegroundColor Red
        Write-Host "    |" -ForegroundColor Red
        Write-Host "    | Current config:  $currentConfig" -ForegroundColor Red
        Write-Host "    | Current account: $currentAccount" -ForegroundColor Red
        Write-Host "    | Current project: $currentProject" -ForegroundColor Red
        Write-Host "    |" -ForegroundColor Red
        Write-Host "    | DEPLOYMENT BLOCKED. Run:" -ForegroundColor Red
        Write-Host "    | gcloud config configurations activate $EXPECTED_CONFIG" -ForegroundColor Yellow
        Write-Host "    +================================================================+" -ForegroundColor Red
        Write-Host ""
        exit 1
    }
}
Write-Host "    [OK] No contamination" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 1: Directory Check
# ============================================================================

Write-Host "[1] Directory Check" -ForegroundColor Yellow

if (-not (Test-Path ".\src\core\signing-core.ts")) {
    Write-Host "    [FAIL] Not in elaraSign root directory" -ForegroundColor Red
    exit 1
}
Write-Host "    [OK] Correct directory" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 2: Configuration Check
# ============================================================================

Write-Host "[2] gcloud Configuration" -ForegroundColor Yellow
Write-Host "    Current:  $currentConfig" -ForegroundColor White
Write-Host "    Expected: $EXPECTED_CONFIG" -ForegroundColor Gray

if ($currentConfig -ne $EXPECTED_CONFIG) {
    Write-Host "    [FAIL] Wrong configuration" -ForegroundColor Red
    
    $configExists = gcloud config configurations list --filter="name=$EXPECTED_CONFIG" --format="value(name)" 2>$null
    if ($configExists -eq $EXPECTED_CONFIG) {
        $switch = Read-Host "    Switch to '$EXPECTED_CONFIG'? (yes/no)"
        if ($switch -eq "yes") {
            $null = gcloud config configurations activate $EXPECTED_CONFIG 2>&1
            $currentAccount = (gcloud config get-value account 2>$null).Trim()
            $currentProject = (gcloud config get-value project 2>$null).Trim()
            Write-Host "    [OK] Switched" -ForegroundColor Green
        } else {
            exit 1
        }
    } else {
        Write-Host "    Configuration '$EXPECTED_CONFIG' doesn't exist. Create it:" -ForegroundColor Red
        Write-Host "    gcloud config configurations create $EXPECTED_CONFIG" -ForegroundColor Cyan
        exit 1
    }
} else {
    Write-Host "    [OK] Correct" -ForegroundColor Green
}
Write-Host ""

# ============================================================================
# STEP 3: Account Check
# ============================================================================

Write-Host "[3] Google Account" -ForegroundColor Yellow
Write-Host "    Current:  $currentAccount" -ForegroundColor White
Write-Host "    Expected: $EXPECTED_ACCOUNT" -ForegroundColor Gray

if ($currentAccount -ne $EXPECTED_ACCOUNT) {
    Write-Host "    [FAIL] Wrong account" -ForegroundColor Red
    $fix = Read-Host "    Login as '$EXPECTED_ACCOUNT'? (yes/no)"
    if ($fix -eq "yes") {
        $null = gcloud config set account $EXPECTED_ACCOUNT 2>&1
        $null = gcloud auth login $EXPECTED_ACCOUNT 2>&1
        $currentAccount = (gcloud config get-value account 2>$null).Trim()
        if ($currentAccount -ne $EXPECTED_ACCOUNT) {
            Write-Host "    [FAIL] Login failed" -ForegroundColor Red
            exit 1
        }
        Write-Host "    [OK] Fixed" -ForegroundColor Green
    } else {
        exit 1
    }
} else {
    Write-Host "    [OK] Correct" -ForegroundColor Green
}
Write-Host ""

# ============================================================================
# STEP 4: Project Check
# ============================================================================

Write-Host "[4] GCP Project" -ForegroundColor Yellow
Write-Host "    Current:  $currentProject" -ForegroundColor White
Write-Host "    Expected: $EXPECTED_PROJECT" -ForegroundColor Gray

if ($currentProject -ne $EXPECTED_PROJECT) {
    Write-Host "    [FAIL] Wrong project" -ForegroundColor Red
    $fix = Read-Host "    Switch to '$EXPECTED_PROJECT'? (yes/no)"
    if ($fix -eq "yes") {
        $null = gcloud config set project $EXPECTED_PROJECT 2>&1
        Write-Host "    [OK] Fixed" -ForegroundColor Green
    } else {
        exit 1
    }
} else {
    Write-Host "    [OK] Correct" -ForegroundColor Green
}
Write-Host ""

# ============================================================================
# STEP 5: Final Safety Re-check
# ============================================================================

Write-Host "[5] Final Safety Check" -ForegroundColor Yellow

$finalConfig = (gcloud config configurations list --filter="is_active=true" --format="value(name)" 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()
$finalAccount = (gcloud config get-value account 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()
$finalProject = (gcloud config get-value project 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()

$allFinal = "$finalConfig $finalAccount $finalProject"
foreach ($banned in $BANNED_PATTERNS) {
    if ($allFinal -match $banned) {
        Write-Host "    [FAIL] CONTAMINATION: $banned" -ForegroundColor Red
        exit 1
    }
}

if ($finalConfig -ne $EXPECTED_CONFIG -or $finalAccount -ne $EXPECTED_ACCOUNT -or $finalProject -ne $EXPECTED_PROJECT) {
    Write-Host "    [FAIL] Mismatch after fixes" -ForegroundColor Red
    exit 1
}

Write-Host "    [OK] All safety checks passed" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 6: Pre-flight Checks
# ============================================================================

Write-Host "[6] Pre-flight Checks" -ForegroundColor Yellow

if (-not $SkipTests) {
    Write-Host "    [1/3] Tests..." -ForegroundColor Cyan
    npm test 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [FAIL] Tests failed" -ForegroundColor Red
        npm test
        exit 1
    }
    Write-Host "    [OK] Tests passed" -ForegroundColor Green
} else {
    Write-Host "    [1/3] SKIPPED" -ForegroundColor Yellow
}

Write-Host "    [2/3] Build..." -ForegroundColor Cyan
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    [FAIL] Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "    [OK] Build succeeded" -ForegroundColor Green

Write-Host "    [3/3] Lint..." -ForegroundColor Cyan
npm run lint 2>&1 | Out-Null
Write-Host "    [OK] Lint done" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 7: Local Docker Test (optional)
# ============================================================================

if ($LocalOnly) {
    Write-Host "[7] Building locally..." -ForegroundColor Yellow
    docker build -t elara-sign:local .
    if ($LASTEXITCODE -ne 0) { exit 1 }
    
    Write-Host "    Running at http://localhost:8080 (Ctrl+C to stop)" -ForegroundColor Green
    docker run --rm -p 8080:8080 elara-sign:local
    exit 0
}

# ============================================================================
# STEP 8: Confirmation
# ============================================================================

Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "    DEPLOYMENT SUMMARY (from deploy.config.json)" -ForegroundColor Yellow
Write-Host ""
Write-Host "    Config:   $EXPECTED_CONFIG" -ForegroundColor White
Write-Host "    Account:  $EXPECTED_ACCOUNT" -ForegroundColor White
Write-Host "    Project:  $EXPECTED_PROJECT" -ForegroundColor White
Write-Host "    Service:  $SERVICE_NAME" -ForegroundColor White
Write-Host "    Region:   $REGION" -ForegroundColor White
Write-Host "    Domain:   $DOMAIN" -ForegroundColor White
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Type 'DEPLOY' to proceed"
    if ($confirm -ne "DEPLOY") {
        Write-Host "[CANCELLED]" -ForegroundColor Red
        exit 1
    }
}

# ============================================================================
# STEP 9: Deploy
# ============================================================================

Write-Host ""
Write-Host "[9] Deploying..." -ForegroundColor Yellow

# FINAL check right before deploy
$deployProject = (gcloud config get-value project 2>&1 | Where-Object { $_ -notmatch "WARNING" }).Trim()
foreach ($banned in $BANNED_PATTERNS) {
    if ($deployProject -match $banned) {
        Write-Host "    [BLOCKED] $banned found in project" -ForegroundColor Red
        exit 1
    }
}

$commitHash = git rev-parse --short HEAD 2>$null
if ([string]::IsNullOrEmpty($commitHash)) { $commitHash = "manual" }

gcloud builds submit `
    --config=cloudbuild.yaml `
    --substitutions=SHORT_SHA=$commitHash `
    --project=$EXPECTED_PROJECT

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Deployment failed" -ForegroundColor Red
    exit 1
}

# ============================================================================
# SUCCESS
# ============================================================================

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "                      DEPLOYMENT SUCCESSFUL                             " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "    Test: curl https://$DOMAIN/api/health" -ForegroundColor Cyan
Write-Host ""
