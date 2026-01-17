# QUICK START - Fresh Machine Test

## 1. Prerequisites (5 minutes)

```bash
# Verify Node.js 24+
node --version

# Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# Verify OpenSSL (required for P12 certificates)
openssl version
# If missing on Windows: choco install openssl
```

**Note**: You don't need to authenticate with gcloud manually - the setup script will handle it!

## 2. Clone & Setup (10 minutes)

```bash
git clone <repo-url>
cd elaraSign
npm install
npm run setup
```

### What Happens During Setup

**Step 1-2**: Checks dependencies (Node, gcloud, npm)

**Step 3: Google Authentication**
- Browser opens automatically
- Sign in with your Google account
- Click "Allow" to grant access
- Return to terminal when done

**Step 4**: Installs npm dependencies

**Step 5: Project Configuration**
- Shows your existing GCP projects (if any)
- Provides link to create new project if needed
- Asks for project details:
  - **Project ID**: Your GCP project (can create new one)
  - **Region**: Press Enter for us-central1
  - **Domain**: Optional, press Enter to skip
  - **Organization**: Your company name
  - **Service email**: Public contact
  - **Admin email**: YOUR email for login

**Step 6: Project Creation** (if needed)
- Offers to create project automatically
- Or guides you through manual creation
- Links billing account

**Steps 7-14**: Automated
- Enables GCP APIs
- Creates Artifact Registry
- Generates secrets (master key, P12 cert)
- Sets up service accounts
- Configures Firebase
- **ONE MANUAL STEP**: Enable Google Sign-In (clear instructions)

## 3. Verify (2 minutes)

```bash
# Check secrets created
gcloud secrets list --project=<your-project>

# Should see 5 secrets:
# - elarasign-master-key
# - elarasign-p12-certificate
# - elarasign-p12-password  
# - elarasign-firebase-api-key
# - elarasign-firebase-app-id

# Run preflight
npm run preflight
# Should pass all checks ✅
```

## 4. Deploy (5 minutes)

```bash
npm run deploy

# Wait for Cloud Build (~3-5 min)
# Get preview URL when done
```

## 5. Test (5 minutes)

```bash
# Get URL
gcloud run services describe elara-sign --region=<region> --format="value(status.url)"

# Open in browser
# Test:
# 1. Upload an image
# 2. Fill metadata
# 3. Click Sign
# 4. Download signed image
# 5. Try Google Sign-In
```

## 6. Promote (1 minute)

```bash
npm run traffic
# Select option 1: Promote preview → live
```

---

## 🐛 If Something Breaks

### "OpenSSL not found"
```bash
# Windows
choco install openssl

# Mac
brew install openssl

# Linux
apt-get install openssl
```

### "Firebase CLI not found"
```bash
npm install -g firebase-tools
npm run setup  # Re-run to complete Firebase setup
```

### "Could not auto-create Firestore"
1. Go to https://console.firebase.google.com/project/<your-project>/firestore
2. Click "Create database"
3. Choose "Native mode"
4. Select same region as Cloud Run
5. Press Enter in terminal to continue

### "Artifact repository not found"
**This shouldn't happen** - setup.ts creates it automatically.
If it does, run:
```bash
gcloud artifacts repositories create elara-sign-repo \
  --repository-format=docker \
  --location=<your-region>
```

---

## ✅ Success Criteria

After setup, you should have:
- [ ] deploy.config.json file
- [ ] web/firebase-config.js file
- [ ] firestore.rules file
- [ ] 5 secrets in Secret Manager
- [ ] Service account created
- [ ] Artifact Registry repo created
- [ ] Firestore database (or instructions to create)
- [ ] Google Sign-In enabled in Firebase Console

After deploy:
- [ ] Cloud Run service deployed
- [ ] Preview URL accessible
- [ ] Can sign files
- [ ] Can verify files
- [ ] Google Sign-In works
- [ ] firebase-config.js loads in browser

---

## 📊 Expected Timeline

| Step | Duration | Can Fail? |
|------|----------|-----------|
| Prerequisites | 5 min | Yes (install tools) |
| npm install | 2 min | Rarely |
| npm run setup | 10 min | Possible (permissions) |
| npm run preflight | 1 min | If setup failed |
| npm run deploy | 5 min | If missing permissions |
| Testing | 5 min | If auth not configured |
| **TOTAL** | **~30 min** | See troubleshooting |

---

## 🎯 One-Command Test (Advanced)

If you're brave and have everything installed:

```bash
# Clone
git clone <repo-url> && cd elaraSign

# Setup
npm install && npm run setup

# Deploy
npm run deploy

# Get URL and open
gcloud run services describe elara-sign --region=us-central1 --format="value(status.url)" | xargs open
```

Note: You'll still need to:
1. Answer setup prompts
2. Enable Google Sign-In manually
3. Wait for Cloud Build

---

## 📞 Support

If you find issues:
1. Check TESTING_GUIDE.md for detailed troubleshooting
2. Check FINAL_AUDIT_REPORT.md for known issues
3. Report bugs with:
   - Command that failed
   - Full error output
   - GCP project details (region, APIs enabled)

---

**Good luck! The script is honest - if it says it worked, it worked. If it says manual step needed, follow the instructions.** 🚀
