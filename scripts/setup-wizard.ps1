# elaraSign First-Time Setup Wizard
# ==================================
# Interactive setup for new deployments

param(
    [string]$ProjectId = "elarasign-prod",
    [string]$Region = "us-central1",
    [string]$ServiceName = "elara-sign",
    [string]$RepoName = "elara-sign-repo",
    [switch]$SkipConfirmation,
    [switch]$SkipForensic  # Skip forensic key setup
)

$ErrorActionPreference = "Stop"
$SecretName = "elarasign-master-key"

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Cyan
    Write-Host ("-" * 60)
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Failure {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# ==============================================================================
# BANNER
# ==============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "           elaraSign Cloud Run Setup Wizard                 " -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Project:  $ProjectId"
Write-Host "Region:   $Region"
Write-Host "Service:  $ServiceName"
Write-Host ""

if (-not $SkipConfirmation) {
    $confirm = Read-Host "Continue with setup? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Aborted."
        exit 0
    }
}

# ==============================================================================
# STEP 1: Check Prerequisites
# ==============================================================================

Write-Step "1/9" "Checking prerequisites"

if (-not (Test-Command "gcloud")) {
    Write-Failure "gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
    exit 1
}
Write-Success "gcloud CLI found"

if (-not (Test-Command "npm")) {
    Write-Failure "npm not found. Install Node.js from https://nodejs.org"
    exit 1
}
Write-Success "npm found"

# Check gcloud auth
$account = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $account) {
    Write-Failure "Not logged in to gcloud. Run: gcloud auth login"
    exit 1
}
Write-Success "Logged in as: $account"

# ==============================================================================
# STEP 2: Check/Create Project
# ==============================================================================

Write-Step "2/9" "Checking GCP project"

$projectExists = gcloud projects describe $ProjectId --format="value(projectId)" 2>$null
if (-not $projectExists) {
    Write-Warning "Project $ProjectId does not exist"
    $create = Read-Host "Create project? (y/N)"
    if ($create -eq "y" -or $create -eq "Y") {
        gcloud projects create $ProjectId --name="elaraSign Production"
        if ($LASTEXITCODE -ne 0) {
            Write-Failure "Failed to create project"
            exit 1
        }
        Write-Success "Project created"
    } else {
        Write-Failure "Cannot continue without project"
        exit 1
    }
} else {
    Write-Success "Project exists: $ProjectId"
}

# ==============================================================================
# STEP 3: Check Billing
# ==============================================================================

Write-Step "3/9" "Checking billing"

$billing = gcloud billing projects describe $ProjectId --format="value(billingAccountName)" 2>$null
if (-not $billing) {
    Write-Warning "No billing account linked"
    Write-Host ""
    Write-Host "Link billing at:"
    Write-Host "https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter after linking billing..."
    
    # Re-check
    $billing = gcloud billing projects describe $ProjectId --format="value(billingAccountName)" 2>$null
    if (-not $billing) {
        Write-Failure "Billing still not linked. Cannot continue."
        exit 1
    }
}
Write-Success "Billing linked"

# ==============================================================================
# STEP 4: Enable APIs
# ==============================================================================

Write-Step "4/9" "Enabling required APIs"

$apis = @(
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "secretmanager.googleapis.com"  # For forensic master key
)

foreach ($api in $apis) {
    Write-Host "  Enabling $api..."
    gcloud services enable $api --project=$ProjectId 2>$null
}
Write-Success "All APIs enabled"

# ==============================================================================
# STEP 5: Create Artifact Registry Repository
# ==============================================================================

Write-Step "5/9" "Checking Artifact Registry repository"

$repoExists = gcloud artifacts repositories describe $RepoName --location=$Region --project=$ProjectId --format="value(name)" 2>$null
if (-not $repoExists) {
    Write-Host "  Creating repository $RepoName..."
    gcloud artifacts repositories create $RepoName `
        --repository-format=docker `
        --location=$Region `
        --project=$ProjectId `
        --description="elaraSign Docker images"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Failed to create repository"
        exit 1
    }
    Write-Success "Repository created"
} else {
    Write-Success "Repository exists: $RepoName"
}

# ==============================================================================
# STEP 6: Configure IAM for Cloud Build
# ==============================================================================

Write-Step "6/9" "Configuring IAM permissions"

$projectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
$cloudBuildSA = "${projectNumber}@cloudbuild.gserviceaccount.com"

Write-Host "  Granting Cloud Run Admin to Cloud Build..."
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$cloudBuildSA" `
    --role="roles/run.admin" `
    --quiet 2>$null

Write-Host "  Granting Service Account User to Cloud Build..."
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$cloudBuildSA" `
    --role="roles/iam.serviceAccountUser" `
    --quiet 2>$null

Write-Success "IAM configured"

# ==============================================================================
# STEP 7: Forensic Accountability Key (Secret Manager)
# ==============================================================================

Write-Step "7/9" "Setting up forensic accountability key"

if ($SkipForensic) {
    Write-Warning "Skipped (forensic accountability disabled)"
} else {
    Write-Host ""
    Write-Host "  Forensic accountability embeds encrypted data in signed images." -ForegroundColor White
    Write-Host "  Only YOU (the operator) can decrypt this data with the master key." -ForegroundColor White
    Write-Host "  Use case: Law enforcement requests traceability for illegal content." -ForegroundColor White
    Write-Host ""
    
    # Check if secret already exists
    $existingSecret = gcloud secrets describe $SecretName --project=$ProjectId 2>$null
    
    if ($existingSecret) {
        Write-Success "Master key already exists in Secret Manager"
        Write-Host ""
        Write-Host "  View in console: " -NoNewline
        Write-Host "https://console.cloud.google.com/security/secret-manager/secret/$SecretName/versions?project=$ProjectId" -ForegroundColor Cyan
    } else {
        $setupForensic = Read-Host "  Set up forensic accountability? (Y/n)"
        if ($setupForensic -ne "n" -and $setupForensic -ne "N") {
            Write-Host ""
            Write-Host "  Generating 256-bit master key..." -ForegroundColor White
            
            # Generate key
            $masterKey = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
            
            if ($masterKey.Length -ne 64) {
                Write-Failure "Key generation failed"
                exit 1
            }
            
            # Store in Secret Manager
            Write-Host "  Storing in Secret Manager..."
            $masterKey | gcloud secrets create $SecretName --data-file=- --project=$ProjectId --replication-policy="automatic" 2>$null
            
            if ($LASTEXITCODE -ne 0) {
                Write-Failure "Failed to create secret"
                exit 1
            }
            
            # Grant Cloud Run access
            $computeSA = "${projectNumber}-compute@developer.gserviceaccount.com"
            gcloud secrets add-iam-policy-binding $SecretName `
                --member="serviceAccount:$computeSA" `
                --role="roles/secretmanager.secretAccessor" `
                --project=$ProjectId `
                --quiet 2>$null
            
            Write-Success "Master key created and stored in Secret Manager"
            Write-Host ""
            Write-Host "  Your key is safely stored in Google Secret Manager." -ForegroundColor White
            Write-Host "  View/copy anytime: " -NoNewline
            Write-Host "https://console.cloud.google.com/security/secret-manager/secret/$SecretName/versions?project=$ProjectId" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "  (Click the secret version -> 'View Secret Value' to copy)" -ForegroundColor Gray
        } else {
            Write-Warning "Skipped (you can run setup-forensic-key.ps1 later)"
        }
    }
}

# ==============================================================================
# STEP 8: Local Build Test
# ==============================================================================

Write-Step "8/9" "Testing local build"

Write-Host "  Running npm run build..."
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Local build failed:"
    Write-Host $buildResult
    exit 1
}
Write-Success "Local build passed"

# ==============================================================================
# STEP 9: Deploy
# ==============================================================================

Write-Step "9/9" "Ready to deploy"

Write-Host ""
Write-Host "All prerequisites are met!" -ForegroundColor Green
Write-Host ""
Write-Host "To deploy, run:"
Write-Host ""
Write-Host "  gcloud builds submit --config=cloudbuild.yaml --project=$ProjectId --substitutions=SHORT_SHA=v1" -ForegroundColor Yellow
Write-Host ""

$deploy = Read-Host "Deploy now? (y/N)"
if ($deploy -eq "y" -or $deploy -eq "Y") {
    gcloud builds submit --config=cloudbuild.yaml --project=$ProjectId --substitutions=SHORT_SHA=v1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Success "Deployment successful!"
        
        $url = gcloud run services describe $ServiceName --region=$Region --project=$ProjectId --format="value(status.url)" 2>$null
        if ($url) {
            Write-Host ""
            Write-Host "Service URL: $url" -ForegroundColor Green
            Write-Host ""
            Write-Host "Run smoke tests:"
            Write-Host "  .\scripts\smoke-test.ps1 -ServiceUrl $url" -ForegroundColor Yellow
        }
    } else {
        Write-Failure "Deployment failed. Check build logs."
    }
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Magenta
Write-Host ""