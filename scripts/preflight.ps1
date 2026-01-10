# elaraSign Pre-Deployment Checks
# ================================
# Run before every deployment to catch issues early

param(
    [string]$ProjectId = "elarasign-prod",
    [switch]$Fix
)

$ErrorActionPreference = "Continue"
$script:issues = 0

function Write-Check {
    param([string]$Name)
    Write-Host "  Checking: $Name... " -NoNewline
}

function Write-OK {
    Write-Host "OK" -ForegroundColor Green
}

function Write-Issue {
    param([string]$Message, [string]$Fix)
    $script:issues++
    Write-Host "ISSUE" -ForegroundColor Red
    Write-Host "    $Message" -ForegroundColor Red
    if ($Fix) {
        Write-Host "    Fix: $Fix" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "elaraSign Pre-Deployment Checks" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# ==============================================================================
# Code Quality
# ==============================================================================

Write-Host "Code Quality:" -ForegroundColor Yellow

# TypeScript compilation
Write-Check "TypeScript compiles"
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-OK
} else {
    Write-Issue "TypeScript compilation failed" "npm run build"
}

# Check for console.log in production code
Write-Check "No console.log in cloud routes"
$consoleLogs = Select-String -Path "src/cloud/**/*.ts" -Pattern "console\.log" -ErrorAction SilentlyContinue
if ($consoleLogs) {
    Write-Issue "Found console.log statements (use proper logging)" "Remove or replace with structured logging"
} else {
    Write-OK
}

# ==============================================================================
# Configuration
# ==============================================================================

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow

# Check Dockerfile exists
Write-Check "Dockerfile exists"
if (Test-Path "Dockerfile") {
    Write-OK
} else {
    Write-Issue "Dockerfile not found" "Create Dockerfile"
}

# Check cloudbuild.yaml
Write-Check "cloudbuild.yaml exists"
if (Test-Path "cloudbuild.yaml") {
    Write-OK
} else {
    Write-Issue "cloudbuild.yaml not found" "Create cloudbuild.yaml"
}

# Check .dockerignore
Write-Check ".dockerignore exists"
if (Test-Path ".dockerignore") {
    Write-OK
} else {
    Write-Issue ".dockerignore not found (build will be slow)" "Create .dockerignore"
}

# Check node_modules in .dockerignore
Write-Check "node_modules in .dockerignore"
$dockerignore = Get-Content ".dockerignore" -ErrorAction SilentlyContinue
if ($dockerignore -match "node_modules") {
    Write-OK
} else {
    Write-Issue "node_modules not in .dockerignore" "Add node_modules to .dockerignore"
}

# ==============================================================================
# Security
# ==============================================================================

Write-Host ""
Write-Host "Security:" -ForegroundColor Yellow

# Check for hardcoded secrets
Write-Check "No hardcoded API keys"
$secrets = Select-String -Path "src/**/*.ts" -Pattern "(api[_-]?key|secret|password)\s*[:=]\s*['""][^'""]+['""]" -ErrorAction SilentlyContinue
if ($secrets) {
    Write-Issue "Possible hardcoded secrets found" "Use environment variables"
} else {
    Write-OK
}

# Check .env not committed
Write-Check ".env in .gitignore"
$gitignore = Get-Content ".gitignore" -ErrorAction SilentlyContinue
if ($gitignore -match "\.env") {
    Write-OK
} else {
    Write-Issue ".env not in .gitignore" "Add .env* to .gitignore"
}

# ==============================================================================
# GCP Configuration
# ==============================================================================

Write-Host ""
Write-Host "GCP Configuration:" -ForegroundColor Yellow

# Check gcloud project
Write-Check "gcloud project set to $ProjectId"
$currentProject = gcloud config get-value project 2>$null
if ($currentProject -eq $ProjectId) {
    Write-OK
} else {
    Write-Issue "Current project is '$currentProject'" "gcloud config set project $ProjectId"
    if ($Fix) {
        gcloud config set project $ProjectId
    }
}

# Check not using banned projects
Write-Check "Not using banned project"
$bannedProjects = @("phillabor-crm", "openelaracrm", "applied-ai-assistant")
if ($currentProject -in $bannedProjects) {
    Write-Issue "Using banned project: $currentProject" "Switch to elarasign-prod"
} else {
    Write-OK
}

# Check forensic master key exists
Write-Check "Forensic master key in Secret Manager"
$secretExists = gcloud secrets describe elarasign-master-key --project=$ProjectId 2>$null
if ($secretExists) {
    Write-OK
} else {
    Write-Host "WARN" -ForegroundColor Yellow
    Write-Host "    Forensic accountability not configured (optional)" -ForegroundColor Yellow
    Write-Host "    To enable: .\scripts\setup-wizard.ps1 or .\scripts\setup-forensic-key.ps1" -ForegroundColor Gray
}

# ==============================================================================
# Dependencies
# ==============================================================================

Write-Host ""
Write-Host "Dependencies:" -ForegroundColor Yellow

# Check package-lock.json exists
Write-Check "package-lock.json exists"
if (Test-Path "package-lock.json") {
    Write-OK
} else {
    Write-Issue "package-lock.json not found" "npm install"
}

# Check for vulnerabilities
Write-Check "No critical vulnerabilities"
$auditOutput = npm audit --json 2>$null | ConvertFrom-Json
if ($auditOutput.metadata.vulnerabilities.critical -gt 0) {
    Write-Issue "$($auditOutput.metadata.vulnerabilities.critical) critical vulnerabilities" "npm audit fix"
} else {
    Write-OK
}

# ==============================================================================
# Summary
# ==============================================================================

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan

if ($script:issues -eq 0) {
    Write-Host "All checks passed! Ready to deploy." -ForegroundColor Green
    Write-Host ""
    Write-Host "Deploy with:"
    Write-Host "  gcloud builds submit --config=cloudbuild.yaml --project=$ProjectId --substitutions=SHORT_SHA=v1" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "$($script:issues) issue(s) found. Fix before deploying." -ForegroundColor Red
    exit 1
}
