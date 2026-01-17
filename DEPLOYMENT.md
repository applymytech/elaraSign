# elaraSign Deployment

**ONE script handles everything.**

## Quick Start

```bash
./setup.sh      # Set up project, APIs, secrets, permissions
./preflight.sh  # Verify everything is ready
./deploy.sh     # Deploy preview (0% traffic)
./promote.sh    # Go live
```

If something breaks:
```bash
./rollback.sh   # Revert to previous version
```

---

## What setup.sh Does (Automatic)

1. ✅ Checks Node.js 24+
2. ✅ Checks gcloud SDK  
3. ✅ Authenticates you (`gcloud auth login` if needed)
4. ✅ Installs npm dependencies
5. ✅ **Creates deploy.config.json interactively**
6. ✅ Verifies GCP project access
7. ✅ **Enables required APIs** (Cloud Build, Cloud Run, Artifact Registry, Secret Manager)
8. ✅ **Creates Artifact Registry repository**
9. ✅ **Generates forensic master key** (64 bytes, cryptographically secure)
10. ✅ **Generates P12 signing certificate** (OpenSSL, 10-year validity)
11. ✅ **Uploads secrets to Secret Manager**
12. ✅ **Configures service account permissions**

After setup.sh completes, you're ready to deploy.

---

## Configuration (deploy.config.json)

Setup.sh creates this interactively. Example:

```json
{
  "gcloud": {
    "account": "you@example.com",
    "project": "your-project-id",
    "region": "us-central1"
  },
  "service": {
    "name": "elara-sign",
    "domain": ""  // Optional - leave empty to use Cloud Run URL
  },
  "identity": {
    "organizationName": "Your Organization",
    "serviceEmail": "signing@example.com"
  }
}
```

**Custom domain is optional.** If you don't have one, leave it empty and Cloud Run will give you a URL.

---

## The Scripts

| Script | What It Does | When To Run |
|--------|--------------|-------------|
| `setup.sh` | Complete first-time setup | Once per project |
| `preflight.sh` | Verify everything ready | Before each deploy |
| `deploy.sh` | Deploy with 0% traffic | Deploy new version |
| `promote.sh` | Route 100% traffic to new version | After testing preview |
| `rollback.sh` | Revert to previous version | If promoted version has issues |

### Deploy Workflow

```
setup.sh        # First time only
    ↓
preflight.sh    # Every time before deploy
    ↓
deploy.sh       # Get preview URL
    ↓
Test preview    # Make sure it works
    ↓
promote.sh      # Go live
```

### If Something Breaks

```
rollback.sh     # Instantly revert to previous version
```

---

## Requirements

- **Node.js 24+** ([nodejs.org](https://nodejs.org) or `choco install nodejs-lts`)
- **Google Cloud SDK** ([cloud.google.com/sdk](https://cloud.google.com/sdk) or `choco install gcloudsdk`)
- **OpenSSL** (for certificate generation - included with Git on Windows)
- **Google Cloud Project** (free tier works, ~$5/month under load)

### Windows Users

All scripts work in Git Bash. Use Chocolatey for dependencies:

```powershell
choco install nodejs-lts gcloudsdk
```

---

## Secrets & Keys

### What Gets Generated

| Secret | How | Where |
|--------|-----|-------|
| **Forensic Master Key** | 64 random bytes | Secret Manager |
| **P12 Certificate** | OpenSSL self-signed | Secret Manager + local certs/ |
| **P12 Password** | 64 random hex chars | Secret Manager + local certs/ |

### Security

- Secrets stored in **Google Secret Manager** (encrypted at rest)
- Service account gets read-only access to secrets
- Local copies in `certs/` directory (gitignored)
- **Never commit secrets** - setup.sh generates fresh ones for each deployment

---

## Troubleshooting

### "gcloud not found"

**Windows:** Use Git Bash (not PowerShell). Or install gcloud:
```powershell
choco install gcloudsdk
```

**Linux/Mac:** Install from [cloud.google.com/sdk](https://cloud.google.com/sdk)

### "Permission denied"

Run `gcloud auth login` and make sure you have Editor or Owner role on the GCP project.

### "API not enabled"

Run setup.sh again - it will enable missing APIs automatically.

### "Secrets already exist"

That's fine! setup.sh detects existing secrets and skips regeneration. Your keys persist across deployments.

---

## Cost Estimate

| Component | Free Tier | Typical Cost |
|-----------|-----------|--------------|
| Cloud Run | 2M requests/month | $0 - $5/month |
| Artifact Registry | 0.5 GB free | ~$0.10/month |
| Secret Manager | 6 secrets free | $0.06/month |
| Cloud Build | 120 builds/day | Free |
| **Total** | | **~$5/month max** |

With light traffic, you'll stay in free tier. At scale (thousands of signs/day), costs remain minimal.

---

## Custom Domain Setup

If you want `sign.yourdomain.com` instead of the Cloud Run URL:

1. **During setup.sh**: Enter your domain when prompted
2. **After deployment**: 
   - Get the Cloud Run URL from deploy.sh output
   - Add a CNAME record: `sign → your-service.run.app`
   - Map domain in Cloud Run console

**Don't have a domain?** Leave it blank during setup - Cloud Run URL works fine.

---

## Architecture

```
GitHub → Cloud Build → Artifact Registry → Cloud Run
                                              ↓
                                    Secret Manager
                                    (master key, P12 cert)
```

- **No database** - Stateless signing service
- **No authentication** - Public service (like HTTPS certificate issuers)
- **Session storage** - Temporary files auto-delete after download/timeout
- **Secrets** - Master key and certificates in Secret Manager

---

## Update Deployment

To deploy a new version:

```bash
./preflight.sh   # Verify code
./deploy.sh      # Deploy preview
./promote.sh     # Go live
```

Previous version remains available for instant rollback.

---

## Support
