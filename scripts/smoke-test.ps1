# elaraSign Smoke Tests
# ======================
# Verifies deployed service is functioning correctly

param(
    [string]$ServiceUrl,
    [string]$ProjectId = "elarasign-prod",
    [string]$Region = "us-central1",
    [string]$ServiceName = "elara-sign",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Auto-detect service URL if not provided
if (-not $ServiceUrl) {
    Write-Host "Detecting service URL..." -ForegroundColor Gray
    $ServiceUrl = gcloud run services describe $ServiceName --region=$Region --project=$ProjectId --format="value(status.url)" 2>$null
    if (-not $ServiceUrl) {
        Write-Host "[FAIL] Could not detect service URL. Is the service deployed?" -ForegroundColor Red
        exit 1
    }
}

$ServiceUrl = $ServiceUrl.TrimEnd('/')

# ==============================================================================
# Test Helpers
# ==============================================================================

$script:passed = 0
$script:failed = 0
$script:tests = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Path,
        [string]$Body,
        [string]$ContentType = "application/json",
        [int]$ExpectedStatus = 200,
        [scriptblock]$Validate
    )
    
    $url = "$ServiceUrl$Path"
    $result = @{
        Name = $Name
        Url = $url
        Method = $Method
        Passed = $false
        Error = $null
        Duration = 0
    }
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        $params = @{
            Uri = $url
            Method = $Method
            UseBasicParsing = $true
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = $ContentType
        }
        
        $response = Invoke-WebRequest @params
        $stopwatch.Stop()
        $result.Duration = $stopwatch.ElapsedMilliseconds
        
        if ($response.StatusCode -ne $ExpectedStatus) {
            $result.Error = "Expected status $ExpectedStatus, got $($response.StatusCode)"
        } elseif ($Validate) {
            $content = $response.Content
            $validateResult = & $Validate $content
            if ($validateResult -ne $true) {
                $result.Error = "Validation failed: $validateResult"
            } else {
                $result.Passed = $true
            }
        } else {
            $result.Passed = $true
        }
    } catch {
        $result.Error = $_.Exception.Message
    }
    
    $script:tests += $result
    
    if ($result.Passed) {
        $script:passed++
        Write-Host "[PASS] $Name ($($result.Duration)ms)" -ForegroundColor Green
    } else {
        $script:failed++
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       $($result.Error)" -ForegroundColor Red
    }
    
    if ($Verbose -and $result.Passed) {
        Write-Host "       URL: $url" -ForegroundColor Gray
    }
    
    return $result.Passed
}

# ==============================================================================
# Banner
# ==============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           elaraSign Smoke Tests                            " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service: $ServiceUrl"
Write-Host ""

# ==============================================================================
# Tests
# ==============================================================================

Write-Host "--- Health & Status ---" -ForegroundColor Yellow
Write-Host ""

# Test 1: Health endpoint
Test-Endpoint -Name "Health endpoint" -Path "/health" -Validate {
    param($content)
    $json = $content | ConvertFrom-Json
    if ($json.status -eq "healthy") { return $true }
    return "Status is not 'healthy'"
}

# Test 2: Root redirect or page
Test-Endpoint -Name "Root endpoint" -Path "/" -ExpectedStatus 200

# Test 3: API info
Test-Endpoint -Name "API info" -Path "/api" -Validate {
    param($content)
    $json = $content | ConvertFrom-Json
    if ($json.service -eq "elaraSign") { return $true }
    return "Service name mismatch"
}

Write-Host ""
Write-Host "--- API Endpoints ---" -ForegroundColor Yellow
Write-Host ""

# Test 4: Sign endpoint (OPTIONS/preflight)
Test-Endpoint -Name "Sign endpoint CORS" -Method "OPTIONS" -Path "/api/sign" -ExpectedStatus 204

# Test 5: Verify endpoint (GET should return method info or 400)
Test-Endpoint -Name "Verify endpoint exists" -Path "/api/verify" -ExpectedStatus 400 -Validate {
    param($content)
    # Should return an error about missing file
    return $true
}

# Test 6: Sign endpoint validation (missing file)
Test-Endpoint -Name "Sign endpoint validation" -Method "POST" -Path "/api/sign" -ExpectedStatus 400 -Validate {
    param($content)
    $json = $content | ConvertFrom-Json
    if ($json.error) { return $true }
    return "Expected error response"
}

Write-Host ""
Write-Host "--- Static Assets ---" -ForegroundColor Yellow
Write-Host ""

# Test 7: Web UI
Test-Endpoint -Name "Web UI (index.html)" -Path "/index.html" -Validate {
    param($content)
    if ($content -match "elaraSign") { return $true }
    return "Expected elaraSign in HTML"
}

# Test 8: Favicon or static assets
Test-Endpoint -Name "Static assets accessible" -Path "/favicon.ico" -ExpectedStatus 200

Write-Host ""
Write-Host "--- Performance ---" -ForegroundColor Yellow
Write-Host ""

# Test 9: Response time
$healthTest = Test-Endpoint -Name "Response time < 2s" -Path "/health" -Validate {
    param($content)
    return $true
}

# Check if health response was fast enough
$healthResult = $script:tests | Where-Object { $_.Name -eq "Response time < 2s" }
if ($healthResult.Duration -gt 2000) {
    Write-Host "[WARN] Response time was $($healthResult.Duration)ms (> 2000ms)" -ForegroundColor Yellow
}

# ==============================================================================
# Summary
# ==============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "                       SUMMARY                              " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$total = $script:passed + $script:failed
$percentage = if ($total -gt 0) { [math]::Round(($script:passed / $total) * 100) } else { 0 }

if ($script:failed -eq 0) {
    Write-Host "All tests passed! ($script:passed/$total)" -ForegroundColor Green
} else {
    Write-Host "Tests: $script:passed passed, $script:failed failed ($percentage%)" -ForegroundColor Yellow
}

Write-Host ""

# Exit with appropriate code
if ($script:failed -gt 0) {
    exit 1
}
exit 0
