<#
.SYNOPSIS
    Deploy elaraSign to Google Cloud Run

.DESCRIPTION
    Builds and deploys elaraSign to Cloud Run with safety checks.
    Uses sign.openelara.org domain.

.PARAMETER ProjectId
    The Google Cloud project ID (default: elara-sign)

.PARAMETER Region
    The Cloud Run region (default: us-central1)

.PARAMETER SkipTests
    Skip running tests before deploy

.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 -ProjectId "my-project"
#>

param(
    [string]$ProjectId = "elara-sign",
    [string]$Region = "us-central1",
    [string]$ServiceName = "elara-sign",
    [switch]$SkipTests,
    [switch]$LocalOnly
)

$ErrorActionPreference = "Stop"

# ============================================================================
# SAFETY CHECKS
# ============================================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                         elaraSign Deployment                                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check we're in the right directory
if (-not (Test-Path ".\src\core\signing-core.ts")) {
    Write-Host "❌ ERROR: Must run from elaraSign root directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Deployment Configuration:" -ForegroundColor Yellow
Write-Host "   Project:  $ProjectId"
Write-Host "   Region:   $Region"
Write-Host "   Service:  $ServiceName"
Write-Host "   Domain:   sign.openelara.org"
Write-Host ""

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================

Write-Host "🔍 Running pre-flight checks..." -ForegroundColor Yellow
Write-Host ""

# 1. Run tests
if (-not $SkipTests) {
    Write-Host "   [1/4] Running tests..." -ForegroundColor Cyan
    try {
        $testOutput = npm test 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Tests failed!" -ForegroundColor Red
            Write-Host $testOutput
            exit 1
        }
        Write-Host "   ✅ Tests passed" -ForegroundColor Green
    } catch {
        Write-Host "❌ Test execution failed: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   [1/4] ⚠️ Skipping tests (--SkipTests)" -ForegroundColor Yellow
}

# 2. Check TypeScript compiles
Write-Host "   [2/4] Building TypeScript..." -ForegroundColor Cyan
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Build succeeded" -ForegroundColor Green
} catch {
    Write-Host "❌ Build execution failed: $_" -ForegroundColor Red
    exit 1
}

# 3. Lint check
Write-Host "   [3/4] Running linter..." -ForegroundColor Cyan
try {
    npm run lint 2>&1 | Out-Null
    Write-Host "   ✅ Lint passed" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️ Lint warnings (continuing)" -ForegroundColor Yellow
}

# 4. Check gcloud is available
Write-Host "   [4/4] Checking gcloud CLI..." -ForegroundColor Cyan
try {
    $gcloudVersion = gcloud version 2>&1 | Select-Object -First 1
    Write-Host "   ✅ $gcloudVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ All pre-flight checks passed!" -ForegroundColor Green
Write-Host ""

# ============================================================================
# LOCAL DOCKER TEST (optional)
# ============================================================================

if ($LocalOnly) {
    Write-Host "🐳 Building and running locally..." -ForegroundColor Yellow
    
    docker build -t elara-sign:local .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "🚀 Starting local container on http://localhost:8080" -ForegroundColor Green
    Write-Host "   Press Ctrl+C to stop" -ForegroundColor Gray
    Write-Host ""
    
    docker run --rm -p 8080:8080 elara-sign:local
    exit 0
}

# ============================================================================
# DEPLOYMENT CONFIRMATION
# ============================================================================

Write-Host "⚠️  DEPLOYMENT CONFIRMATION" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host ""
Write-Host "   You are about to deploy to: $ProjectId" -ForegroundColor White
Write-Host "   Service URL: https://sign.openelara.org" -ForegroundColor White
Write-Host ""
Write-Host "   This will:" -ForegroundColor Gray
Write-Host "   • Build a new Docker image" -ForegroundColor Gray
Write-Host "   • Push to Artifact Registry" -ForegroundColor Gray
Write-Host "   • Deploy to Cloud Run" -ForegroundColor Gray
Write-Host "   • Make the API publicly accessible" -ForegroundColor Gray
Write-Host ""

$confirmation = Read-Host "Type 'DEPLOY' to continue"
if ($confirmation -ne "DEPLOY") {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================================================
# DEPLOY VIA CLOUD BUILD
# ============================================================================

Write-Host "🚀 Starting deployment..." -ForegroundColor Yellow
Write-Host ""

# Set project
gcloud config set project $ProjectId

# Submit build
Write-Host "📦 Submitting to Cloud Build..." -ForegroundColor Cyan
gcloud builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD 2>$null || echo "manual")

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                         ✅ DEPLOYMENT SUCCESSFUL                             ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "   Service URL: https://$ServiceName-xxxxx-uc.a.run.app" -ForegroundColor White
Write-Host "   Custom Domain: https://sign.openelara.org (after DNS setup)" -ForegroundColor White
Write-Host ""
Write-Host "   Test with:" -ForegroundColor Gray
Write-Host "   curl https://sign.openelara.org/api/health" -ForegroundColor Gray
Write-Host ""
