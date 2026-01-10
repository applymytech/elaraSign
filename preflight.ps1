# Preflight Script for elaraSign
# Run this BEFORE testing or deploying
#
# Usage:
#   .\preflight.ps1           # Full preflight with tests
#   .\preflight.ps1 -SkipTests # Skip tests (emergency only)
#
# This script:
# 1. Verifies environment
# 2. Cleans build artifacts
# 3. Builds TypeScript
# 4. Runs tests (unless skipped)
# 5. Creates .preflight-passed marker

param(
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_NAME = "elara-sign"
$REQUIRED_NODE_MAJOR = 20
$MARKER_FILE = ".preflight-passed"
$BUILD_DIRS = @("dist")

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-OK {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Exit-WithError {
    param([string]$Message)
    Write-Host ""
    Write-Fail $Message
    Write-Host ""
    Write-Host "Preflight FAILED." -ForegroundColor Red
    exit 1
}

# ============================================================================
# STEP 1: ENVIRONMENT CHECK
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign - Preflight Check          " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Step "Checking environment"

# Check we're in the right directory
if (-not (Test-Path "package.json")) {
    Exit-WithError "package.json not found. Run this from the elaraSign root directory."
}

$packageJson = Get-Content "package.json" | ConvertFrom-Json
if ($packageJson.name -ne $PROJECT_NAME) {
    Exit-WithError "Wrong project! Expected '$PROJECT_NAME', found '$($packageJson.name)'"
}
Write-OK "Project: $PROJECT_NAME v$($packageJson.version)"

# Check Node.js
try {
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+).*', '$1')
    if ($nodeMajor -lt $REQUIRED_NODE_MAJOR) {
        Exit-WithError "Node.js $REQUIRED_NODE_MAJOR+ required. Found: $nodeVersion"
    }
    Write-OK "Node.js: $nodeVersion"
} catch {
    Exit-WithError "Node.js not found"
}

# Check npm
try {
    $npmVersion = npm --version
    Write-OK "npm: v$npmVersion"
} catch {
    Exit-WithError "npm not found"
}

# ============================================================================
# STEP 2: CLEAN BUILD ARTIFACTS
# ============================================================================

Write-Step "Cleaning build artifacts"

foreach ($dir in $BUILD_DIRS) {
    if (Test-Path $dir) {
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
        Write-Host "[INFO] Removed: $dir/" -ForegroundColor Gray
    }
}

if (Test-Path $MARKER_FILE) {
    Remove-Item $MARKER_FILE
}

Write-OK "Build artifacts cleaned"

# ============================================================================
# STEP 3: INSTALL DEPENDENCIES
# ============================================================================

Write-Step "Checking dependencies"

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Exit-WithError "npm install failed"
    }
}
Write-OK "Dependencies ready"

# ============================================================================
# STEP 4: BUILD
# ============================================================================

Write-Step "Building TypeScript"

npm run build
if ($LASTEXITCODE -ne 0) {
    Exit-WithError "TypeScript build failed"
}
Write-OK "Build complete"

# ============================================================================
# STEP 5: RUN TESTS
# ============================================================================

if (-not $SkipTests) {
    Write-Step "Running tests"
    
    npm run test:run
    if ($LASTEXITCODE -ne 0) {
        Exit-WithError "Tests failed"
    }
    Write-OK "All tests passed"
} else {
    Write-Warn "Tests SKIPPED (--SkipTests flag)"
}

# ============================================================================
# STEP 6: VERIFY CORE FILE
# ============================================================================

Write-Step "Verifying signing-core"

$coreFile = "src/core/signing-core.ts"
if (-not (Test-Path $coreFile)) {
    Exit-WithError "signing-core.ts not found at $coreFile"
}

$coreContent = Get-Content $coreFile -Raw
if ($coreContent -match "ELARA_SIGN_VERSION") {
    $versionMatch = [regex]::Match($coreContent, 'ELARA_SIGN_VERSION\s*=\s*"([^"]+)"')
    if ($versionMatch.Success) {
        Write-OK "signing-core version: $($versionMatch.Groups[1].Value)"
    }
}

# ============================================================================
# STEP 7: WRITE MARKER FILE
# ============================================================================

Write-Step "Creating preflight marker"

$marker = @{
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    project = $PROJECT_NAME
    version = $packageJson.version
    node = $nodeVersion
    testsRan = (-not $SkipTests)
    user = $env:USERNAME
}

$marker | ConvertTo-Json | Out-File -Encoding UTF8 $MARKER_FILE
Write-OK "Marker created"

# ============================================================================
# DONE
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PREFLIGHT PASSED                     " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Project: $PROJECT_NAME v$($packageJson.version)" -ForegroundColor White
Write-Host "Tests:   $(if ($SkipTests) { 'SKIPPED' } else { 'PASSED' })" -ForegroundColor $(if ($SkipTests) { 'Yellow' } else { 'Green' })
Write-Host ""
Write-Host "Ready to:"
Write-Host "  - Run dev server: npm run dev" -ForegroundColor Cyan
Write-Host "  - Copy to apps:   See copy-to-apps.ps1" -ForegroundColor Cyan
Write-Host ""
