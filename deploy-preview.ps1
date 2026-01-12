# elaraSign Preview Deployment
#
# Deploys a new revision WITHOUT routing traffic to it.
# The developer can test the preview URL, then run deploy-promote.ps1 to go live.
#
# ENFORCEMENT PHILOSOPHY:
# =======================
# 1. Heaven enforcement (strict) = Awareness/truth-gathering, may flag false positives
# 2. App preflight (tailored) = Gates deployment, respects legitimate ignores
# 3. VS Code Problems panel = Helpful but NOT the truth source
#
# WORKFLOW:
# =========
# 1. Run Heaven enforcement (awareness - reports all issues)
# 2. Run App preflight (gates deployment - app-specific rules)
# 3. Deploy preview (no traffic)
# 4. Test the preview URL
# 5. If good: .\deploy-promote.ps1
# 6. If bad: No action needed (traffic still on old version)
#
# ROLLBACK:
# =========
# If issues after promotion: .\deploy-rollback.ps1

$ErrorActionPreference = "Stop"

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
$region = $config.gcloud.region
$serviceName = $config.service.name
$serviceDomain = $config.service.domain

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign PREVIEW Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  This deploys WITHOUT routing traffic." -ForegroundColor Yellow
Write-Host "  Test the preview, then run deploy-promote.ps1" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# ENFORCEMENT GATE 1: Heaven's Compliance Enforcer (AWARENESS)
# ============================================================================
# Heaven is STRICT and runs actual linters. It may flag things this app
# legitimately ignores. This is for awareness - app preflight gates deployment.
Write-Host "[1/7] Running Heaven's Compliance Enforcer (awareness)..." -ForegroundColor Yellow

$heavenPath = "c:\architecture-review"
if (Test-Path $heavenPath) {
    Push-Location $heavenPath
    # Target just this app with --app flag
    $heavenOutput = & npx tsx elara-engineer/compliance-enforcer.ts --app=elaraSign 2>&1
    $heavenExitCode = $LASTEXITCODE
    $heavenResult = $heavenOutput -join "`n"
    Pop-Location
    
    if ($heavenExitCode -ne 0) {
        Write-Host "      WARN - Heaven found issues (review below):" -ForegroundColor Yellow
        $heavenOutput | ForEach-Object { Write-Host "            $_" -ForegroundColor Yellow }
        Write-Host ""
        Write-Host "      Heaven is strict. App preflight will determine if deployment proceeds." -ForegroundColor Gray
    } else {
        Write-Host "      OK - Heaven compliance passed" -ForegroundColor Green
    }
} else {
    Write-Host "      SKIP - Heaven not found at $heavenPath" -ForegroundColor Gray
}

# ============================================================================
# ENFORCEMENT GATE 2: App Preflight (GATES DEPLOYMENT)
# ============================================================================
# This is what ACTUALLY gates deployment. Uses app's biome.json with
# legitimate ignores. Must pass with 0 errors and 0 warnings.
Write-Host "[2/7] Running App Preflight (this gates deployment)..." -ForegroundColor Yellow

# Biome lint (must be 0 errors, 0 warnings)
$lintOutput = & npm run lint 2>&1
$lintStr = $lintOutput -join "`n"

if ($LASTEXITCODE -ne 0) {
    Write-Host "      FAIL - Biome found errors:" -ForegroundColor Red
    $lintOutput | Select-Object -Last 15 | ForEach-Object { Write-Host "            $_" -ForegroundColor Red }
    exit 1
}

if ($lintStr -match "Found \d+ warnings?") {
    Write-Host "      FAIL - Biome found warnings (must be zero):" -ForegroundColor Red
    $lintOutput | Select-Object -Last 15 | ForEach-Object { Write-Host "            $_" -ForegroundColor Red }
    exit 1
}
Write-Host "      OK - Biome lint passed (0 errors, 0 warnings)" -ForegroundColor Green

# TypeScript build
Write-Host "[3/7] Building TypeScript..." -ForegroundColor Yellow
$buildOutput = & npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      FAIL - TypeScript build failed:" -ForegroundColor Red
    $buildOutput | Select-Object -Last 15 | ForEach-Object { Write-Host "            $_" -ForegroundColor Red }
    exit 1
}
Write-Host "      OK - TypeScript compiles" -ForegroundColor Green

# ============================================================================
# GCLOUD SETUP
# ============================================================================
Write-Host "[4/7] Setting up gcloud..." -ForegroundColor Yellow

$configs = & gcloud config configurations list --format="value(name)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^(Activated|Updated)" }
if ($configs -notcontains $gcloudConfig) {
    $null = & gcloud config configurations create $gcloudConfig 2>&1
}
$null = & gcloud config configurations activate $gcloudConfig 2>&1
$null = & gcloud config set account $gcloudAccount 2>&1
$null = & gcloud config set project $gcloudProject 2>&1

# Verify auth
$authList = & gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>&1 | Where-Object { $_ -is [string] }
if ($authList -notcontains $gcloudAccount) {
    Write-Host "      Account $gcloudAccount not authenticated." -ForegroundColor Red
    Write-Host "" 
    Write-Host "      To authenticate, type this command:" -ForegroundColor White
    Write-Host "" 
    Write-Host "        gcloud auth login $gcloudAccount" -ForegroundColor Cyan
    Write-Host "" 
    Write-Host "      Then try again: .\deploy-preview.ps1" -ForegroundColor White
    Write-Host "" 
    exit 1
}
Write-Host "      OK - gcloud configured" -ForegroundColor Green

# ============================================================================
# GET CURRENT REVISION (for rollback reference)
# ============================================================================
Write-Host "[5/7] Recording current live revision..." -ForegroundColor Yellow

$currentRevision = & gcloud run services describe $serviceName --region=$region --format="value(status.traffic[0].revisionName)" 2>&1 | Where-Object { $_ -is [string] -and $_ -notmatch "^ERROR" }
if ($currentRevision) {
    # Save to file for rollback script
    $currentRevision | Out-File -FilePath (Join-Path $PSScriptRoot ".last-live-revision") -NoNewline
    Write-Host "      OK - Current live: $currentRevision" -ForegroundColor Green
} else {
    Write-Host "      INFO - No existing revision (first deploy)" -ForegroundColor Gray
}

# ============================================================================
# DEPLOY PREVIEW (NO TRAFFIC)
# ============================================================================
Write-Host "[6/7] Deploying PREVIEW (no traffic)..." -ForegroundColor Yellow
Write-Host ""

$shortSha = & git rev-parse --short HEAD 2>&1 | Where-Object { $_ -is [string] }
if (-not $shortSha) { $shortSha = "manual" }
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$revisionTag = "preview-$shortSha-$timestamp"

Write-Host "      Revision tag: $revisionTag" -ForegroundColor Gray
Write-Host ""

# Build and deploy with --no-traffic
& gcloud builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA=$shortSha

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

# Get the new revision name
Start-Sleep -Seconds 3
$newRevision = & gcloud run revisions list --service=$serviceName --region=$region --format="value(name)" --limit=1 2>&1 | Where-Object { $_ -is [string] }

# Set new revision to receive NO traffic
Write-Host ""
Write-Host "[7/7] Setting preview to 0% traffic..." -ForegroundColor Yellow
& gcloud run services update-traffic $serviceName --region=$region --to-revisions=$currentRevision=100 2>&1 | Out-Null

# Save new revision for promote script
$newRevision | Out-File -FilePath (Join-Path $PSScriptRoot ".preview-revision") -NoNewline

# Get preview URL
$previewUrl = & gcloud run revisions describe $newRevision --region=$region --format="value(status.url)" 2>&1 | Where-Object { $_ -is [string] }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PREVIEW DEPLOYED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Preview URL:  $previewUrl" -ForegroundColor Cyan
Write-Host "  Live URL:     https://$serviceDomain (unchanged)" -ForegroundColor White
Write-Host ""
Write-Host "  Preview revision: $newRevision" -ForegroundColor Gray
Write-Host "  Live revision:    $currentRevision" -ForegroundColor Gray
Write-Host ""
Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Test the preview URL above" -ForegroundColor White
Write-Host "  2. If good: .\deploy-promote.ps1" -ForegroundColor White
Write-Host "  3. If bad:  No action needed (traffic unchanged)" -ForegroundColor White
Write-Host ""
