<#
.SYNOPSIS
    First-time setup for elaraSign on Google Cloud

.DESCRIPTION
    Creates the necessary GCP resources for elaraSign deployment:
    - Creates the GCP project (or uses existing)
    - Enables required APIs
    - Creates Artifact Registry repository
    - Sets up Cloud Run permissions
    - Configures custom domain

.NOTES
    Run this ONCE before first deployment.
    Requires: gcloud CLI, billing account linked
#>

param(
    [string]$ProjectId = "elara-sign",
    [string]$Region = "us-central1",
    [string]$BillingAccountId = ""  # Get from: gcloud billing accounts list
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    elaraSign - First Time Setup                              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Step 1: Create or select project
# ============================================================================

Write-Host " Step 1: Project Setup" -ForegroundColor Yellow
Write-Host ""

# Check if project exists
$existingProject = gcloud projects describe $ProjectId 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "    Project '$ProjectId' already exists" -ForegroundColor Green
} else {
    Write-Host "   Creating project '$ProjectId'..." -ForegroundColor Cyan
    gcloud projects create $ProjectId --name="elaraSign"
    
    if ($BillingAccountId) {
        gcloud billing projects link $ProjectId --billing-account=$BillingAccountId
    } else {
        Write-Host "   ️ No billing account specified. Link manually in Cloud Console." -ForegroundColor Yellow
    }
}

gcloud config set project $ProjectId

# ============================================================================
# Step 2: Enable APIs
# ============================================================================

Write-Host ""
Write-Host " Step 2: Enable APIs" -ForegroundColor Yellow
Write-Host ""

$apis = @(
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "containerregistry.googleapis.com"
)

foreach ($api in $apis) {
    Write-Host "   Enabling $api..." -ForegroundColor Cyan
    gcloud services enable $api --quiet
}
Write-Host "    All APIs enabled" -ForegroundColor Green

# ============================================================================
# Step 3: Create Artifact Registry
# ============================================================================

Write-Host ""
Write-Host " Step 3: Artifact Registry" -ForegroundColor Yellow
Write-Host ""

$repoName = "elara-sign-repo"
$existingRepo = gcloud artifacts repositories describe $repoName --location=$Region 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "    Repository '$repoName' already exists" -ForegroundColor Green
} else {
    Write-Host "   Creating Artifact Registry repository..." -ForegroundColor Cyan
    gcloud artifacts repositories create $repoName `
        --repository-format=docker `
        --location=$Region `
        --description="elaraSign Docker images"
    Write-Host "    Repository created" -ForegroundColor Green
}

# ============================================================================
# Step 4: Configure Cloud Build permissions
# ============================================================================

Write-Host ""
Write-Host " Step 4: IAM Permissions" -ForegroundColor Yellow
Write-Host ""

$projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)")
$cloudBuildSA = "$projectNumber@cloudbuild.gserviceaccount.com"

Write-Host "   Granting Cloud Run Admin to Cloud Build..." -ForegroundColor Cyan
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$cloudBuildSA" `
    --role="roles/run.admin" `
    --quiet 2>&1 | Out-Null

Write-Host "   Granting Service Account User to Cloud Build..." -ForegroundColor Cyan
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$cloudBuildSA" `
    --role="roles/iam.serviceAccountUser" `
    --quiet 2>&1 | Out-Null

Write-Host "    Permissions configured" -ForegroundColor Green

# ============================================================================
# Summary
# ============================================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                          SETUP COMPLETE                                    ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "   Project: $ProjectId" -ForegroundColor White
Write-Host "   Region:  $Region" -ForegroundColor White
Write-Host ""
Write-Host "   Next steps:" -ForegroundColor Yellow
Write-Host "   1. Run: .\deploy.ps1" -ForegroundColor Gray
Write-Host "   2. After first deploy, set up custom domain:" -ForegroundColor Gray
Write-Host "      gcloud run domain-mappings create --service=elara-sign --domain=sign.openelara.org --region=$Region" -ForegroundColor Gray
Write-Host "   3. Add DNS CNAME record pointing to ghs.googlehosted.com" -ForegroundColor Gray
Write-Host ""
