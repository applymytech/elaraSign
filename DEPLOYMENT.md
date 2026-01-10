# elaraSign Cloud Run Deployment Guide

## Quick Start (Recommended)

Use the setup wizard for first-time deployment:

```powershell
.\scripts\setup-wizard.ps1
```

For subsequent deployments:

```powershell
.\scripts\preflight.ps1              # Pre-deployment checks
gcloud builds submit --config=cloudbuild.yaml --project=elarasign-prod --substitutions=SHORT_SHA=v1
.\scripts\smoke-test.ps1             # Verify deployment
```

---

## Prerequisites Checklist

Before deploying, ensure ALL of the following are complete:

### 1. GCP Project Setup

```powershell
# Create project (if not exists)
gcloud projects create elarasign-prod --name="elaraSign Production"

# Set as active project
gcloud config set project elarasign-prod
```

### 2. Billing

Link billing account via Cloud Console:
- https://console.cloud.google.com/billing/linkedaccount?project=elarasign-prod

Or via CLI:
```powershell
gcloud billing accounts list
gcloud billing projects link elarasign-prod --billing-account=YOUR_BILLING_ACCOUNT_ID
```

### 3. Enable Required APIs

```powershell
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com --project=elarasign-prod
```

### 4. Create Artifact Registry Repository

**This is commonly missed and causes "Repository not found" errors.**

```powershell
gcloud artifacts repositories create elara-sign-repo --repository-format=docker --location=us-central1 --project=elarasign-prod
```

### 5. IAM Permissions

Grant your account owner access (if needed):
```powershell
gcloud projects add-iam-policy-binding elarasign-prod --member="user:YOUR_EMAIL@domain.com" --role="roles/owner"
```

Grant Cloud Build permission to deploy to Cloud Run:
```powershell
# Get the Cloud Build service account
PROJECT_NUMBER=$(gcloud projects describe elarasign-prod --format='value(projectNumber)')

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding elarasign-prod --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" --role="roles/run.admin"

# Grant Service Account User role (to act as the runtime service account)
gcloud projects add-iam-policy-binding elarasign-prod --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" --role="roles/iam.serviceAccountUser"
```

### 6. Forensic Accountability Key (Optional but Recommended)

The forensic master key enables "break glass" accountability - encrypted data embedded in signed images that only you (the operator) can decrypt upon request from authorities.

**Run this ONCE per project:**

```powershell
.\scripts\setup-forensic-key.ps1
```

This will:
1. Generate a 256-bit master key
2. Store it in Google Secret Manager
3. Grant Cloud Run access to read it
4. Display the key for you to save offline

**⚠️ IMPORTANT:** Save the displayed key somewhere safe (offline/physical). If you lose it, forensic data in signed images cannot be recovered.

**The key persists across all deployments.** Never regenerate it unless you intentionally want to orphan old signatures.

---

## Deployment

### Build and Deploy

```powershell
gcloud builds submit --config=cloudbuild.yaml --project=elarasign-prod --substitutions=SHORT_SHA=v1
```

### Check Build Logs (if failed)

```powershell
gcloud builds list --project=elarasign-prod --limit=1
gcloud builds log BUILD_ID --project=elarasign-prod
```

---

## Custom Domain Setup

### 1. Verify Domain Ownership (first time only)

```powershell
gcloud domains verify openelara.org --project=elarasign-prod
```

### 2. Map Custom Domain to Cloud Run Service

```powershell
gcloud run domain-mappings create --service=elara-sign --domain=sign.openelara.org --region=us-central1 --project=elarasign-prod
```

### 3. Configure DNS

Add the DNS records Google provides (typically):
- **CNAME**: `sign` -> `ghs.googlehosted.com`

Or for apex domains, A records pointing to Google's IPs.

### 4. Wait for SSL

SSL certificate provisioning takes 15-30 minutes. Check status:
```powershell
gcloud run domain-mappings describe --domain=sign.openelara.org --region=us-central1 --project=elarasign-prod
```

---

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Repository "elara-sign-repo" not found` | Artifact Registry repo doesn't exist | Run: `gcloud artifacts repositories create elara-sign-repo --repository-format=docker --location=us-central1 --project=elarasign-prod` |
| `PERMISSION_DENIED: Cloud Build API not enabled` | APIs not enabled | Run: `gcloud services enable cloudbuild.googleapis.com --project=elarasign-prod` |
| `Billing account not found` | Project not linked to billing | Link via Console or `gcloud billing projects link` |
| `TypeScript compilation errors` | Code issues | Run `npm run build` locally first to catch errors |
| `Cloud Run Admin role required` | Cloud Build can't deploy | Grant `roles/run.admin` to Cloud Build service account |

---

## Quick Deploy (All Prerequisites Met)

If everything is already set up:

```powershell
cd C:\myCodeProjects\elaraSign
npm run build                    # Verify locally first
gcloud builds submit --config=cloudbuild.yaml --project=elarasign-prod --substitutions=SHORT_SHA=v1
```

---

## Project Isolation Warning

This project (`elarasign-prod`) is separate from:
- `openelaracloud` - OpenElara Cloud web app
- `phillabor-crm` - Completely unrelated project

NEVER deploy elaraSign to those projects.
