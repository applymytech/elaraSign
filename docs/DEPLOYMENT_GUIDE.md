# elaraSign Deployment Guide

## Quick Reference

```
Configuration: elarasign
Account:       gservices@applymytech.ai
Project:       elarasign-prod
Domain:        sign.openelara.org
Region:        us-central1
Service:       elara-sign

```

---

## 🛡️ Configuration Isolation

### Your gcloud configurations:

| Config | Account | Project | Purpose |
|--------|---------|---------|---------|
| `elarasign` | gservices@applymytech.ai | elarasign-prod | elaraSign service |
| `openelara` | gservices@applymytech.ai | openelaracloud | OpenElara Cloud app |

### ALWAYS activate the right config before working:

```powershell
# For elaraSign work:
gcloud config configurations activate elarasign

# For openElaraCloud work:
gcloud config configurations activate openelara
```

---

## 🎯 Important: Project Architecture

### Should I create a new Firebase/GCP project?

**Already done! Project is `elarasign-prod`**

| Project | Type | Purpose |
|---------|------|---------|
| `openelaracloud` | Firebase + GCP | Cloud AI assistant (your main app) |
| `elarasign-prod` | GCP only (no Firebase) | Content provenance signing service |

### Why separate projects?

1. **Different billing concerns** - elaraSign is a free public service
2. **Different security model** - elaraSign has no user auth, no database
3. **Independent scaling** - elaraSign could get viral traffic
4. **Clean boundaries** - Each service owns its domain

### What elaraSign does NOT need:

- ❌ Firebase (no database, no auth)
- ❌ Firestore
- ❌ Firebase Hosting
- ❌ Firebase Functions

### What elaraSign DOES need:

- ✅ Cloud Run (container hosting)
- ✅ Artifact Registry (Docker images)
- ✅ Cloud Build (CI/CD)
- ✅ Cloud DNS or external DNS (for custom domain)

---

## 🚀 First-Time Setup

### Step 1: Activate the right configuration

```powershell
gcloud config configurations activate elarasign
```

### Step 2: Verify you're in the right place

```powershell
gcloud config list
# Should show:
# account = gservices@applymytech.ai
# project = elarasign-prod
```

### Step 3: Link Billing (if not done)

1. Go to: https://console.cloud.google.com/billing
2. Link `elarasign-prod` project to your billing account

### Step 4: Enable Required APIs

```powershell
gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com
```

### Step 5: Create Artifact Registry

```powershell
gcloud artifacts repositories create elara-sign \
    --repository-format=docker \
    --location=us-central1 \
    --description="elaraSign Docker images"
```

---

## 📦 Deployment

### Regular Deployment

```powershell
.\deploy-safe.ps1
```

The script will:
1. ✅ Verify you're in the right directory
2. ✅ Check gcloud is installed
3. ✅ Verify your Google account
4. ✅ Verify the correct project is selected
5. ✅ Run tests
6. ✅ Build TypeScript
7. ✅ Run linter
8. ✅ Ask for final confirmation
9. 🚀 Deploy to Cloud Run

### Skip Tests (use sparingly)

```powershell
.\deploy-safe.ps1 -SkipTests
```

### Test Locally with Docker

```powershell
.\deploy-safe.ps1 -LocalOnly
```

This builds the Docker image and runs it at http://localhost:8080

---

## 🌐 Custom Domain Setup

### Option A: Using Cloud Run Domain Mapping

```powershell
# Map the domain
gcloud run domain-mappings create \
    --service=elara-sign \
    --domain=sign.openelara.org \
    --region=us-central1

# Get the DNS records to add
gcloud run domain-mappings describe \
    --domain=sign.openelara.org \
    --region=us-central1
```

### Option B: Using Cloudflare (if openelara.org is on Cloudflare)

1. Get the Cloud Run URL (shown after deployment)
2. In Cloudflare DNS, add:
   - Type: CNAME
   - Name: sign
   - Target: `elara-sign-xxx-uc.a.run.app`
   - Proxy: Orange cloud (proxied)

---

## 🔒 Security Notes

### What's Public

- `/api/sign` - Anyone can sign files
- `/api/verify` - Anyone can verify files
- `/api/health` - Health check
- `/` - Demo web UI

### Rate Limiting

Built-in rate limiting: 100 requests/minute per IP

### No Secrets Required

elaraSign has NO secrets:
- No API keys
- No database credentials
- No service accounts needed (Cloud Run has default SA)

This is intentional - it's a stateless signing service.

---

## 🐛 Troubleshooting

### "Wrong account" error

```powershell
gcloud auth login your.email@gmail.com
```

### "Project doesn't exist"

```powershell
.\setup-gcp.ps1
```

### Build fails

```powershell
# Check logs
gcloud builds list --limit=5

# View specific build
gcloud builds log BUILD_ID
```

### Service not responding

```powershell
# Check service status
gcloud run services describe elara-sign --region=us-central1

# Check logs
gcloud run services logs read elara-sign --region=us-central1 --limit=50
```

---

## 📊 Monitoring

### View Logs

```powershell
gcloud run services logs read elara-sign --region=us-central1
```

### Cloud Console

- **Cloud Run**: https://console.cloud.google.com/run?project=elara-sign
- **Cloud Build**: https://console.cloud.google.com/cloud-build?project=elara-sign
- **Logs**: https://console.cloud.google.com/logs?project=elara-sign

---

## 💰 Cost Expectations

elaraSign uses Cloud Run with:
- Pay-per-request pricing
- Scale to zero when idle
- No minimum instances

**Expected cost**: ~$0-5/month for moderate usage

Cloud Run free tier:
- 2 million requests/month free
- 360,000 GB-seconds free
- 180,000 vCPU-seconds free

---

## 📁 File Structure

```
elaraSign/
├── deploy-safe.ps1      # ← USE THIS to deploy
├── deploy.ps1           # Basic deploy (less safe)
├── setup-gcp.ps1        # First-time GCP setup
├── cloudbuild.yaml      # Cloud Build config
├── Dockerfile           # Container definition
├── src/
│   ├── cloud/
│   │   ├── server.ts    # Express server (hardened)
│   │   ├── routes/      # API routes
│   │   └── storage/     # Session management
│   └── core/
│       ├── signing-core.ts        # DNA layer
│       └── standard-metadata.ts   # Passport layer
└── web/
    └── index.html       # Demo UI
```
