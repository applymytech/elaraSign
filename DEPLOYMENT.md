# elaraSign Deployment Guide

## Configuration Pattern

**All deployment scripts are DYNAMIC - no hardcoded values.**

```
deploy.config.json          ← Your actual values (GITIGNORED - stays local)
deploy.config.template.json ← Template for new users (IN REPO)
```

### First-Time Setup

1. Copy the template:
   ```powershell
   Copy-Item deploy.config.template.json deploy.config.json
   ```

2. Edit `deploy.config.json` with your values:
   ```json
   {
     "gcloud": {
       "configuration": "elarasign",
       "account": "your-email@example.com",
       "project": "your-gcp-project-id",
       "region": "us-central1"
     },
     "service": {
       "name": "elara-sign",
       "domain": "sign.yourdomain.com"
     },
     "banned": {
       "patterns": ["client-project", "wrong-account@email.com"]
     }
   }
   ```

3. Run preflight to verify:
   ```powershell
   .\preflight.ps1
   ```

---

## Full Deployment Workflow

### The Professional Pattern

```
.\deploy-checklist.ps1  Human decisions (version, docs, accountability)
        │
        ▼
.\preflight.ps1         Environment validation
        │
        ▼
.\deploy-preview.ps1    Deploy WITHOUT traffic (safe testing)
        │
        ▼
   Test preview URL
        │
        ▼
.\deploy-promote.ps1    Shift 100% traffic to preview
        │
        ▼
   If issues discovered:
.\deploy-rollback.ps1   Emergency revert to previous
```

### Step 1: Pre-Deploy Checklist

```powershell
.\deploy-checklist.ps1
```

This prompts for:
- **Version bump**: Patch (+0.0.1), Minor (+0.1.0), or Major (+1.0.0)
- **Documentation check**: Is it current or stale?
- **Change summary**: What was done (accountability)
- **Completeness**: Complete, Framework/Stubs, or WIP

All decisions are logged to `devdocs/deploy-logs/`.

### Step 2: Preflight

```powershell
.\preflight.ps1
```

Validates environment is ready (gcloud, lint, build).

### Step 3: Deploy Preview

```powershell
.\deploy-preview.ps1
```

Deploys without routing traffic. Test the preview URL.

### Step 4: Promote or Rollback

```powershell
.\deploy-promote.ps1      # Go live
.\deploy-rollback.ps1     # If issues
```

### Commands

| Command | Purpose |
|---------|---------|
| `.\preflight.ps1` | Verify environment is ready |
| `.\deploy-preview.ps1` | Deploy new version WITHOUT traffic |
| `.\deploy-promote.ps1` | Shift traffic to preview (go live) |
| `.\deploy-promote.ps1 -Gradual` | Gradual rollout: 10% → 50% → 100% |
| `.\deploy-rollback.ps1` | Emergency revert to previous version |
| `.\deploy-rollback.ps1 -List` | Show available revisions |
| `.\deploy-status.ps1` | Show current deployment state |

### Example: Safe Deployment

```powershell
# 1. Verify everything is ready
.\preflight.ps1

# 2. Deploy preview (no traffic)
.\deploy-preview.ps1
# Output: Preview URL: https://elara-sign-abc123-uc.a.run.app

# 3. Test the preview URL manually
# - Check health endpoint
# - Test signing/verification
# - Verify UI works

# 4. If good, go live
.\deploy-promote.ps1
# Type: PROMOTE

# 5. If issues after promotion
.\deploy-rollback.ps1
# Type: ROLLBACK
```

---

## Enforcement Hierarchy

```
HEAVEN (architecture-review/elara-engineer)
│   Strict universal rules + runs actual linters
│   May flag things this app legitimately ignores
│   Use: npx tsx elara-engineer/compliance-enforcer.ts --app=elaraSign
│
▼
APP PREFLIGHT (.\preflight.ps1)
│   App-specific rules with legitimate ignores
│   Uses this app's biome.json
│   THIS GATES DEPLOYMENT (must pass)
│
▼
DEPLOY
```

**VS Code Problems panel is NOT the truth source.** Running actual linters is.

---

## What Preflight Checks

| Check | What It Verifies |
|-------|------------------|
| [1] gcloud CLI | gcloud command available |
| [2] Configuration | Named config exists (from deploy.config.json) |
| [3] Authentication | Account is logged in |
| [4] Project Access | Can access the GCP project |
| [5] Node.js | Node.js installed |
| [6] Dependencies | node_modules exists |
| [7] Biome Lint | **0 errors AND 0 warnings** |
| [8] TypeScript | Code compiles successfully |

---

## Files Overview

| File | Purpose | In Git? |
|------|---------|---------|
| `deploy.config.json` | Your deployment config | **No** (gitignored) |
| `deploy.config.template.json` | Template for new users | Yes |
| `preflight.ps1` | Pre-deploy validation | Yes |
| `deploy.ps1` | Direct deploy (legacy) | Yes |
| `deploy-preview.ps1` | Deploy without traffic | Yes |
| `deploy-promote.ps1` | Shift traffic to preview | Yes |
| `deploy-rollback.ps1` | Emergency revert | Yes |
| `deploy-status.ps1` | Show current state | Yes |
| `.preview-revision` | Tracks pending preview | **No** (gitignored) |
| `.last-live-revision` | Tracks rollback target | **No** (gitignored) |

---

## GCP Prerequisites

Before first deployment, ensure:

1. **GCP Project exists**
2. **Billing enabled**
3. **APIs enabled:**
   ```powershell
   gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com
   ```
4. **Artifact Registry repo created:**
   ```powershell
   gcloud artifacts repositories create elara-sign-repo --repository-format=docker --location=us-central1
   ```
5. **Cloud Build has deployment permissions:**
   ```powershell
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT --format='value(projectNumber)')
   gcloud projects add-iam-policy-binding YOUR_PROJECT \
     --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
     --role="roles/run.admin"
   gcloud projects add-iam-policy-binding YOUR_PROJECT \
     --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "deploy.config.json not found" | Copy template: `Copy-Item deploy.config.template.json deploy.config.json` |
| "Account not authenticated" | Run: `gcloud auth login` |
| "Cannot access project" | Check project ID in config, verify billing enabled |
| "Biome found warnings" | Run: `npm run lint:fix` then retry |
| "TypeScript build failed" | Run: `npm run build` locally to see errors |
| "No preview revision found" | Run `deploy-preview.ps1` before `deploy-promote.ps1` |

---

## Project Isolation

**NEVER deploy to wrong projects.** The `banned.patterns` in config blocks deployment if detected:

```json
"banned": {
  "patterns": ["wrong-project", "client@email.com"]
}
```

This prevents accidental cross-contamination between projects.

---

## Developer Documentation

### Working Docs (`devdocs/workingdocs/`)

This folder is for **engineer experiments during development**:
- Test scripts
- Debug utilities  
- Temporary investigation code
- Proof-of-concept files

**This folder is gitignored** (except README.md). Use it freely without cluttering git history.

### Deploy Logs (`devdocs/deploy-logs/`)

Created automatically by `deploy-checklist.ps1`. Each deployment creates a timestamped log:

```
deploy-2025-06-18-103045.log
```

Contains:
- Version bump decision (patch/minor/major)
- Documentation status (updated/stale)
- Change summary (what was done)
- Completeness status (complete/partial)
- Timestamp and engineer notes

**These logs are gitignored** but provide local accountability trail.
