<#
.SYNOPSIS
    Welcome to elaraSign! First-Time Setup Wizard

.DESCRIPTION
    This friendly wizard will get you up and running with elaraSign.
    It checks everything you need and helps you configure your environment.

.NOTES
    The Elara philosophy: Simple, honest, educational.
    You'll learn what each step does as we go!
#>

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  =======================================================================" -ForegroundColor Cyan
    Write-Host "  |                                                                     |" -ForegroundColor Cyan
    Write-Host "  |   Welcome to elaraSign!                                             |" -ForegroundColor Cyan
    Write-Host "  |                                                                     |" -ForegroundColor Cyan
    Write-Host "  |   Content Provenance Standard + Signing Service                     |" -ForegroundColor Cyan
    Write-Host "  |                                                                     |" -ForegroundColor Cyan
    Write-Host "  =======================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  This wizard will help you:" -ForegroundColor White
    Write-Host "    - Check that all required tools are installed" -ForegroundColor Gray
    Write-Host "    - Set up your personal configuration" -ForegroundColor Gray
    Write-Host "    - Get ready to run locally or deploy to the cloud" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  -----------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step {
    param([int]$Number, [int]$Total, [string]$Title)
    Write-Host ""
    Write-Host "  Step $Number of $Total : $Title" -ForegroundColor Yellow
    Write-Host "  -----------------------------------------------------------------------" -ForegroundColor DarkGray
}

function Write-Success {
    param([string]$Message)
    Write-Host "     [OK] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "     [i] $Message" -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Host "     [!] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "     [X] $Message" -ForegroundColor Red
}

function Write-Tip {
    param([string]$Message)
    Write-Host "     TIP: $Message" -ForegroundColor Magenta
}

function Wait-ForKey {
    param([string]$Message = "Press any key to continue...")
    Write-Host ""
    Write-Host "     $Message" -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
}

function Read-YesNo {
    param([string]$Question, [bool]$Default = $true)
    $defaultText = if ($Default) { "[Y/n]" } else { "[y/N]" }
    Write-Host ""
    $response = Read-Host "     $Question $defaultText"
    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }
    return $response -match "^[Yy]"
}

function Read-UserInput {
    param(
        [string]$Prompt,
        [string]$Default = "",
        [string]$Help = ""
    )
    if ($Help) {
        Write-Host "     $Help" -ForegroundColor DarkGray
    }
    $defaultDisplay = if ($Default) { " [$Default]" } else { "" }
    Write-Host ""
    $response = Read-Host "     $Prompt$defaultDisplay"
    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }
    return $response
}

# ============================================================================
# CHECK FUNCTIONS
# ============================================================================

function Test-NodeJS {
    Write-Host ""
    Write-Host "     Checking for Node.js..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What is Node.js?" -ForegroundColor DarkCyan
    Write-Host "        Node.js runs JavaScript outside the browser. elaraSign is" -ForegroundColor DarkGray
    Write-Host "        built with TypeScript (which compiles to JavaScript), so" -ForegroundColor DarkGray
    Write-Host "        Node.js is required to run the server and tests." -ForegroundColor DarkGray
    Write-Host ""
    
    try {
        $nodeVersion = & node --version 2>&1
        if ($nodeVersion -match "^v(\d+)") {
            $majorVersion = [int]$Matches[1]
            if ($majorVersion -ge 20) {
                Write-Success "Node.js $nodeVersion found (v20+ required)"
                return $true
            }
            else {
                Write-Warn "Node.js $nodeVersion found, but v20+ is recommended"
                Write-Tip "Visit https://nodejs.org to download the latest LTS version"
                return $true
            }
        }
    }
    catch {
        # Node not found
    }
    
    Write-Fail "Node.js not found"
    Write-Host ""
    Write-Host "     How to install Node.js:" -ForegroundColor White
    Write-Host ""
    Write-Host "        Option 1: Download from https://nodejs.org" -ForegroundColor Gray
    Write-Host "                  Choose the LTS version (v20 or higher)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "        Option 2: Using winget (Windows Package Manager):" -ForegroundColor Gray
    Write-Host "                  winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "        Option 3: Using Chocolatey:" -ForegroundColor Gray
    Write-Host "                  choco install nodejs-lts" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "        After installing, close this terminal and open a new one." -ForegroundColor Yellow
    Write-Host ""
    return $false
}

function Test-Npm {
    Write-Host ""
    Write-Host "     Checking for npm..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What is npm?" -ForegroundColor DarkCyan
    Write-Host "        npm (Node Package Manager) installs JavaScript libraries." -ForegroundColor DarkGray
    Write-Host "        It comes bundled with Node.js, so if you have Node.js," -ForegroundColor DarkGray
    Write-Host "        you should have npm too!" -ForegroundColor DarkGray
    Write-Host ""
    
    try {
        $npmVersion = & npm --version 2>&1
        if ($npmVersion -match "^\d+") {
            Write-Success "npm v$npmVersion found"
            return $true
        }
    }
    catch {
        # npm not found
    }
    
    Write-Fail "npm not found (this is unusual if Node.js is installed)"
    Write-Tip "Try reinstalling Node.js from https://nodejs.org"
    return $false
}

function Test-Git {
    Write-Host ""
    Write-Host "     Checking for Git..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What is Git?" -ForegroundColor DarkCyan
    Write-Host "        Git is version control - it tracks changes to your code." -ForegroundColor DarkGray
    Write-Host "        Not strictly required, but very useful for development." -ForegroundColor DarkGray
    Write-Host ""
    
    try {
        $gitVersion = & git --version 2>&1
        if ($gitVersion -match "git version") {
            Write-Success "Git found: $gitVersion"
            return $true
        }
    }
    catch {
        # Git not found
    }
    
    Write-Warn "Git not found (optional but recommended)"
    Write-Host ""
    Write-Host "     How to install Git:" -ForegroundColor White
    Write-Host "        Download from https://git-scm.com/download/win" -ForegroundColor Gray
    Write-Host "        Or: winget install Git.Git" -ForegroundColor Cyan
    Write-Host ""
    return $false
}

function Test-GCloud {
    Write-Host ""
    Write-Host "     Checking for Google Cloud CLI (gcloud)..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What is gcloud?" -ForegroundColor DarkCyan
    Write-Host "        The Google Cloud CLI lets you deploy to Google Cloud Run." -ForegroundColor DarkGray
    Write-Host "        This is ONLY needed if you want to deploy to the cloud." -ForegroundColor DarkGray
    Write-Host "        For local development, you can skip this!" -ForegroundColor DarkGray
    Write-Host ""
    
    try {
        $gcloudVersion = & gcloud --version 2>&1 | Select-Object -First 1
        if ($gcloudVersion -match "Google Cloud SDK") {
            Write-Success "Google Cloud CLI found"
            return $true
        }
    }
    catch {
        # gcloud not found
    }
    
    Write-Warn "Google Cloud CLI not found"
    Write-Host ""
    Write-Host "     How to install gcloud (only needed for cloud deployment):" -ForegroundColor White
    Write-Host ""
    Write-Host "        Option 1: Download installer from:" -ForegroundColor Gray
    Write-Host "                  https://cloud.google.com/sdk/docs/install" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "        Option 2: Using winget:" -ForegroundColor Gray
    Write-Host "                  winget install Google.CloudSDK" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "        After installing, close this terminal and open a new one," -ForegroundColor Yellow
    Write-Host "        then run: gcloud init" -ForegroundColor Cyan
    Write-Host ""
    return $false
}

function Test-Docker {
    Write-Host ""
    Write-Host "     Checking for Docker..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What is Docker?" -ForegroundColor DarkCyan
    Write-Host "        Docker packages apps into containers for consistent deployment." -ForegroundColor DarkGray
    Write-Host "        Optional - only needed for local container testing or cloud deploy." -ForegroundColor DarkGray
    Write-Host ""
    
    try {
        $dockerVersion = & docker --version 2>&1
        if ($dockerVersion -match "Docker version") {
            Write-Success "Docker found: $dockerVersion"
            return $true
        }
    }
    catch {
        # Docker not found
    }
    
    Write-Warn "Docker not found (optional)"
    Write-Host ""
    Write-Host "     How to install Docker Desktop:" -ForegroundColor White
    Write-Host "        Download from https://www.docker.com/products/docker-desktop" -ForegroundColor Gray
    Write-Host "        Or: winget install Docker.DockerDesktop" -ForegroundColor Cyan
    Write-Host ""
    return $false
}

# ============================================================================
# SETUP FUNCTIONS
# ============================================================================

function Install-Dependencies {
    Write-Host ""
    Write-Host "     Installing npm packages..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What happens here?" -ForegroundColor DarkCyan
    Write-Host "        npm reads package.json and downloads all the libraries" -ForegroundColor DarkGray
    Write-Host "        elaraSign needs. This typically takes 30-60 seconds." -ForegroundColor DarkGray
    Write-Host ""
    
    $result = & npm install 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Dependencies installed successfully!"
        return $true
    }
    else {
        Write-Fail "npm install failed"
        Write-Host "     Error details:" -ForegroundColor Red
        $result | ForEach-Object { Write-Host "       $_" -ForegroundColor DarkRed }
        return $false
    }
}

function Test-Project {
    Write-Host ""
    Write-Host "     Running tests to verify everything works..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "     What are these tests?" -ForegroundColor DarkCyan
    Write-Host "        Tests verify the signing code works correctly. They sign" -ForegroundColor DarkGray
    Write-Host "        images, verify them, and check edge cases. If tests pass," -ForegroundColor DarkGray
    Write-Host "        you know the core functionality is working!" -ForegroundColor DarkGray
    Write-Host ""
    
    $result = & npm test 2>&1
    $output = $result -join "`n"
    
    if ($output -match "All.*tests passed" -or $output -match "passed") {
        Write-Success "All tests passed!"
        return $true
    }
    else {
        Write-Warn "Some tests may have issues (this might be okay)"
        return $true
    }
}

function New-DeployConfig {
    param([hashtable]$Config)
    
    $configPath = Join-Path $PSScriptRoot "deploy.config.json"
    
    $configContent = @{
        '$schema' = "./deploy.config.schema.json"
        '_comment' = "Deployment configuration for elaraSign. Generated by first-time-setup.ps1"
        gcloud = @{
            configuration = $Config.GCloudConfig
            account = $Config.GCloudAccount
            project = $Config.GCloudProject
            region = $Config.Region
        }
        service = @{
            name = $Config.ServiceName
            domain = $Config.Domain
        }
        identity = @{
            '_comment' = "Service identity for witness model - appears on signed documents"
            organizationName = $Config.OrganizationName
            serviceEmail = $Config.ServiceEmail
        }
        banned = @{
            '_comment' = "Patterns that will BLOCK deployment if found in gcloud config"
            patterns = @()
        }
    }
    
    $json = $configContent | ConvertTo-Json -Depth 4
    $json | Set-Content $configPath -Encoding UTF8
    
    return $configPath
}

# ============================================================================
# MAIN WIZARD
# ============================================================================

Write-Banner

Write-Host "  Let's check what you have installed and get you set up!" -ForegroundColor White
Write-Host ""

$continue = Read-YesNo "Ready to begin?"
if (-not $continue) {
    Write-Host ""
    Write-Host "  No problem! Run this script again when you're ready." -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

# ============================================================================
# STEP 1: Check Prerequisites
# ============================================================================

$totalSteps = 5
Write-Step -Number 1 -Total $totalSteps -Title "Check Prerequisites"

$hasNode = Test-NodeJS
$hasNpm = Test-Npm
$hasGit = Test-Git
$hasGCloud = Test-GCloud
$hasDocker = Test-Docker

Write-Host ""
Write-Host "     -----------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

if (-not $hasNode -or -not $hasNpm) {
    Write-Host "  [!] Node.js and npm are required to continue." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please install them and run this wizard again!" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Summarize
Write-Host "     Summary:" -ForegroundColor White
Write-Host "       - Node.js and npm:  Ready" -ForegroundColor Green
if ($hasGit) {
    Write-Host "       - Git:             Ready" -ForegroundColor Green
}
else {
    Write-Host "       - Git:             Not found (optional)" -ForegroundColor DarkGray
}
if ($hasGCloud) {
    Write-Host "       - Google Cloud:    Ready" -ForegroundColor Green
}
else {
    Write-Host "       - Google Cloud:    Not found (needed for cloud deploy)" -ForegroundColor DarkGray
}
if ($hasDocker) {
    Write-Host "       - Docker:          Ready" -ForegroundColor Green
}
else {
    Write-Host "       - Docker:          Not found (optional)" -ForegroundColor DarkGray
}

Wait-ForKey

# ============================================================================
# STEP 2: Install Dependencies
# ============================================================================

Write-Step -Number 2 -Total $totalSteps -Title "Install Dependencies"

$depsInstalled = Install-Dependencies

if (-not $depsInstalled) {
    Write-Host ""
    Write-Host "  [!] Failed to install dependencies." -ForegroundColor Red
    Write-Host "     Try running 'npm install' manually to see detailed errors." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Wait-ForKey

# ============================================================================
# STEP 3: Run Tests
# ============================================================================

Write-Step -Number 3 -Total $totalSteps -Title "Verify Installation"

$null = Test-Project

Wait-ForKey

# ============================================================================
# STEP 4: Configure Your Deployment (Optional)
# ============================================================================

Write-Step -Number 4 -Total $totalSteps -Title "Configure Deployment (Optional)"

Write-Host ""
Write-Host "     About Deployment Configuration" -ForegroundColor DarkCyan
Write-Host "        elaraSign can run in two ways:" -ForegroundColor DarkGray
Write-Host ""
Write-Host "        1. LOCAL MODE: Just run 'npm run dev'" -ForegroundColor White
Write-Host "           No config needed! Great for development." -ForegroundColor DarkGray
Write-Host ""
Write-Host "        2. CLOUD MODE: Deploy to Google Cloud Run" -ForegroundColor White
Write-Host "           Needs a deploy.config.json with your settings." -ForegroundColor DarkGray
Write-Host ""

$configPath = Join-Path $PSScriptRoot "deploy.config.json"
$hasConfig = Test-Path $configPath
$reconfigure = $false

if ($hasConfig) {
    Write-Success "deploy.config.json already exists"
    $reconfigure = Read-YesNo "Would you like to reconfigure it?" $false
    if (-not $reconfigure) {
        Write-Info "Keeping existing configuration"
    }
    else {
        $hasConfig = $false
    }
}

if (-not $hasConfig -or $reconfigure) {
    $wantConfig = Read-YesNo "Would you like to set up cloud deployment now?" (-not $hasConfig)
    
    if ($wantConfig) {
        if (-not $hasGCloud) {
            Write-Warn "Google Cloud CLI is not installed"
            Write-Host "     You can still create the config, but you'll need gcloud to deploy." -ForegroundColor DarkGray
        }
        
        Write-Host ""
        Write-Host "     Let's set up your deployment configuration!" -ForegroundColor White
        Write-Host "     (You can change these later by editing deploy.config.json)" -ForegroundColor DarkGray
        Write-Host ""
        
        # Gather configuration
        $gcloudConfig = Read-UserInput `
            -Prompt "gcloud configuration name" `
            -Default "elarasign" `
            -Help "A name to identify this project's gcloud settings (lowercase, no spaces)"
        
        $gcloudAccount = Read-UserInput `
            -Prompt "Google account email" `
            -Default "" `
            -Help "The Google account that owns the GCP project"
        
        $gcloudProject = Read-UserInput `
            -Prompt "GCP project ID" `
            -Default "elara-sign" `
            -Help "The Google Cloud project ID (will be created if it doesn't exist)"
        
        $serviceName = Read-UserInput `
            -Prompt "Cloud Run service name" `
            -Default "elara-sign" `
            -Help "The name of your Cloud Run service"
        
        # Region selection with friendly display
        Write-Host ""
        Write-Host "     Where should elaraSign run?" -ForegroundColor White
        Write-Host ""
        Write-Host "     FREE TIER regions (recommended to start):" -ForegroundColor Green
        Write-Host "       1. us-central1     (United States)" -ForegroundColor Gray
        Write-Host "       2. us-east1        (United States)" -ForegroundColor Gray
        Write-Host "       3. us-west1        (United States)" -ForegroundColor Gray
        Write-Host "       4. europe-west1    (Belgium/Europe)" -ForegroundColor Gray
        Write-Host "       5. asia-east1      (Taiwan/Asia)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "     STANDARD regions (more locations):" -ForegroundColor Yellow
        Write-Host "       6. europe-west2    (United Kingdom)" -ForegroundColor Gray
        Write-Host "       7. europe-west3    (Germany)" -ForegroundColor Gray
        Write-Host "       8. asia-northeast1 (Japan)" -ForegroundColor Gray
        Write-Host "       9. australia-southeast1 (Australia)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "     Or enter any valid GCP region code" -ForegroundColor DarkGray
        Write-Host ""
        
        $regionChoice = Read-UserInput `
            -Prompt "Choose region (1-9 or region code)" `
            -Default "1" `
            -Help "Signatures will show the country where the service runs"
        
        # Map choice to region code
        $regionMap = @{
            "1" = "us-central1"
            "2" = "us-east1"
            "3" = "us-west1"
            "4" = "europe-west1"
            "5" = "asia-east1"
            "6" = "europe-west2"
            "7" = "europe-west3"
            "8" = "asia-northeast1"
            "9" = "australia-southeast1"
        }
        
        if ($regionMap.ContainsKey($regionChoice)) {
            $region = $regionMap[$regionChoice]
        } else {
            $region = $regionChoice
        }
        
        Write-Info "Selected region: $region"
        
        # Organization identity
        Write-Host ""
        Write-Host "     Service Identity (appears on signed documents)" -ForegroundColor White
        Write-Host ""
        
        $orgName = Read-UserInput `
            -Prompt "Organization name" `
            -Default "elaraSign Service" `
            -Help "Your organization/company name (shown in PDF signatures)"
        
        $serviceEmail = Read-UserInput `
            -Prompt "Service email" `
            -Default "signing@$gcloudProject.example.com" `
            -Help "Contact email for the signing service"
        
        $domain = Read-UserInput `
            -Prompt "Custom domain (optional)" `
            -Default "sign.$gcloudProject.example.com" `
            -Help "Leave as default if you don't have a domain yet"
        
        # Create config
        $config = @{
            GCloudConfig = $gcloudConfig
            GCloudAccount = $gcloudAccount
            GCloudProject = $gcloudProject
            ServiceName = $serviceName
            Region = $region
            Domain = $domain
            OrganizationName = $orgName
            ServiceEmail = $serviceEmail
        }
        
        $null = New-DeployConfig $config
        Write-Host ""
        Write-Success "Created deploy.config.json"
        Write-Info "You can edit this file anytime to change settings"
        
        # Certificate setup prompt
        Write-Host ""
        Write-Host "     -----------------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "     NEXT STEP: Certificate Setup" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "     For PKCS#7 digital signatures (Adobe-visible), run:" -ForegroundColor White
        Write-Host ""
        Write-Host "       .\setup-certificate.ps1" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "     This will:" -ForegroundColor Gray
        Write-Host "       - Generate a signing certificate" -ForegroundColor DarkGray
        Write-Host "       - Store it in Google Secret Manager" -ForegroundColor DarkGray
        Write-Host "       - Configure Cloud Run to use it" -ForegroundColor DarkGray
        Write-Host ""
    }
    else {
        Write-Info "Skipping cloud configuration"
        Write-Host "     You can always run 'npm run dev' for local development!" -ForegroundColor DarkGray
    }
}

Wait-ForKey

# ============================================================================
# STEP 5: You're Ready!
# ============================================================================

Write-Step -Number 5 -Total $totalSteps -Title "You're Ready!"

Write-Host ""
Write-Host "  =======================================================================" -ForegroundColor Green
Write-Host "  |                                                                     |" -ForegroundColor Green
Write-Host "  |   Setup Complete!                                                   |" -ForegroundColor Green
Write-Host "  |                                                                     |" -ForegroundColor Green
Write-Host "  =======================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  What's next?" -ForegroundColor White
Write-Host ""
Write-Host "  +---------------------------------------------------------------------+" -ForegroundColor Cyan
Write-Host "  |  Run Locally (Development)                                          |" -ForegroundColor Cyan
Write-Host "  |                                                                     |" -ForegroundColor Cyan
Write-Host "  |     npm run dev                                                     |" -ForegroundColor White
Write-Host "  |                                                                     |" -ForegroundColor Cyan
Write-Host "  |  Opens at http://localhost:3010                                     |" -ForegroundColor DarkGray
Write-Host "  |  Hot-reloads when you change code!                                  |" -ForegroundColor DarkGray
Write-Host "  +---------------------------------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

if ($hasGCloud -and (Test-Path $configPath)) {
    Write-Host "  +---------------------------------------------------------------------+" -ForegroundColor Magenta
    Write-Host "  |  Deploy to Cloud (Production)                                       |" -ForegroundColor Magenta
    Write-Host "  |                                                                     |" -ForegroundColor Magenta
    Write-Host "  |  First time?                                                        |" -ForegroundColor Magenta
    Write-Host "  |     .\preflight.ps1      Check everything is ready                 |" -ForegroundColor White
    Write-Host "  |                                                                     |" -ForegroundColor Magenta
    Write-Host "  |  Then deploy:                                                       |" -ForegroundColor Magenta
    Write-Host "  |     .\deploy.ps1         Build, test, and deploy                   |" -ForegroundColor White
    Write-Host "  +---------------------------------------------------------------------+" -ForegroundColor Magenta
    Write-Host ""
}

Write-Host "  +---------------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host "  |  Learn More                                                         |" -ForegroundColor Yellow
Write-Host "  |                                                                     |" -ForegroundColor Yellow
Write-Host "  |  - README.md         Project overview and features                  |" -ForegroundColor DarkGray
Write-Host "  |  - docs/             Detailed documentation                         |" -ForegroundColor DarkGray
Write-Host "  |  - web/              The web interface                              |" -ForegroundColor DarkGray
Write-Host "  |  - src/core/         The signing algorithms                         |" -ForegroundColor DarkGray
Write-Host "  +---------------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host ""
Write-Host "  -----------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  TIP: Try it now! Type: npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Happy signing!" -ForegroundColor White
Write-Host ""
