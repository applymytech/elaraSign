# elaraSign Pre-Deploy Checklist
#
# Human-controlled checkpoints before deployment.
# Simple prompts, logged decisions, no complex automation.
#
# PURPOSE:
# - Version control with human decision
# - Documentation honesty check
# - AI/Engineer accountability
# - Intentional deployments, not accidental ones

param(
    [switch]$SkipVersionBump,
    [switch]$SkipDocCheck
)

$ErrorActionPreference = "Continue"

# Load current version
$packagePath = Join-Path $PSScriptRoot "package.json"
$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$currentVersion = $package.version

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  elaraSign Pre-Deploy Checklist" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Current version: $currentVersion" -ForegroundColor White
Write-Host ""

# ============================================================================
# VERSION BUMP (Human Decision)
# ============================================================================
if (-not $SkipVersionBump) {
    Write-Host "[VERSION] Do you want to bump the version?" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [1] Patch  +0.0.1  (bug fixes, minor tweaks)"
    Write-Host "  [2] Minor  +0.1.0  (new features, non-breaking)"
    Write-Host "  [3] Major  +1.0.0  (breaking changes, major release)"
    Write-Host "  [N] No change (keep $currentVersion)"
    Write-Host ""
    $versionChoice = Read-Host "Choice (1/2/3/N)"
    
    $versionParts = $currentVersion -split '\.'
    $major = [int]$versionParts[0]
    $minor = [int]$versionParts[1]
    $patch = [int]$versionParts[2]
    
    $newVersion = $currentVersion
    $versionBumped = $false
    
    switch ($versionChoice.ToUpper()) {
        "1" {
            $patch++
            $newVersion = "$major.$minor.$patch"
            $versionBumped = $true
        }
        "2" {
            $minor++
            $patch = 0
            $newVersion = "$major.$minor.$patch"
            $versionBumped = $true
        }
        "3" {
            $major++
            $minor = 0
            $patch = 0
            $newVersion = "$major.$minor.$patch"
            $versionBumped = $true
        }
        default {
            Write-Host "      Keeping version: $currentVersion" -ForegroundColor Gray
        }
    }
    
    if ($versionBumped) {
        # Update package.json (simple string replace, no complex parsing)
        $packageContent = Get-Content $packagePath -Raw
        $packageContent = $packageContent -replace "`"version`":\s*`"$currentVersion`"", "`"version`": `"$newVersion`""
        $packageContent | Set-Content $packagePath -NoNewline
        Write-Host "      Version bumped: $currentVersion -> $newVersion" -ForegroundColor Green
    }
    Write-Host ""
}

# ============================================================================
# DOCUMENTATION HONESTY CHECK (Human Decision)
# ============================================================================
if (-not $SkipDocCheck) {
    Write-Host "[DOCS] Is the documentation up to date?" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Consider: README.md, DEPLOYMENT.md, code comments,"
    Write-Host "  API documentation, user guides, etc."
    Write-Host ""
    $docsChoice = Read-Host "Documentation is current? (Y/n)"
    
    if ($docsChoice.ToUpper() -eq "N") {
        Write-Host ""
        Write-Host "  Documentation marked as STALE." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  [1] Proceed anyway (intentional - 'let me get this working first')"
        Write-Host "  [2] Proceed anyway (minor tweak - no doc changes needed)"
        Write-Host "  [3] Stop and update documentation"
        Write-Host ""
        $proceedChoice = Read-Host "Choice (1/2/3)"
        
        switch ($proceedChoice) {
            "1" {
                Write-Host "      Proceeding with stale docs (will update later)" -ForegroundColor Yellow
                $docStatus = "STALE_INTENTIONAL"
            }
            "2" {
                Write-Host "      Proceeding (minor change, no doc update needed)" -ForegroundColor Gray
                $docStatus = "NO_UPDATE_NEEDED"
            }
            default {
                Write-Host ""
                Write-Host "      Stopping. Update documentation, then run again." -ForegroundColor Cyan
                exit 0
            }
        }
    } else {
        Write-Host "      Documentation confirmed current." -ForegroundColor Green
        $docStatus = "CURRENT"
    }
    Write-Host ""
}

# ============================================================================
# CHANGE SUMMARY (AI/Engineer Accountability)
# ============================================================================
Write-Host "[CHANGES] What was done in this deployment?" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Briefly describe what changed (for the log):"
Write-Host "  (This holds AI copilots and engineers accountable)"
Write-Host ""
$changeSummary = Read-Host "Summary"

Write-Host ""
Write-Host "[COMPLETENESS] Is this code complete or work-in-progress?" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [1] Complete - Production ready, fully tested"
Write-Host "  [2] Framework/Stubs - Structure in place, needs implementation"
Write-Host "  [3] WIP - Work in progress, partially complete"
Write-Host ""
$completenessChoice = Read-Host "Choice (1/2/3)"

switch ($completenessChoice) {
    "1" { $completeness = "COMPLETE" }
    "2" { $completeness = "FRAMEWORK_STUBS" }
    default { $completeness = "WIP" }
}

# ============================================================================
# LOG THE DECISIONS
# ============================================================================
$logDir = Join-Path $PSScriptRoot "devdocs\deploy-logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logDir "deploy-$timestamp.log"

$logContent = @"
========================================
elaraSign Deploy Log
========================================
Timestamp:    $timestamp
Version:      $(if ($versionBumped) { "$currentVersion -> $newVersion" } else { $currentVersion })
Documentation: $docStatus
Completeness: $completeness

CHANGE SUMMARY:
$changeSummary

========================================
"@

$logContent | Out-File -FilePath $logFile -Encoding UTF8
Write-Host ""
Write-Host "  Logged to: devdocs\deploy-logs\deploy-$timestamp.log" -ForegroundColor Gray

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PRE-DEPLOY CHECKLIST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Version:       $(if ($versionBumped) { $newVersion } else { $currentVersion })"
Write-Host "  Documentation: $docStatus"
Write-Host "  Completeness:  $completeness"
Write-Host ""
Write-Host "  Next: .\deploy-preview.ps1" -ForegroundColor Cyan
Write-Host ""
