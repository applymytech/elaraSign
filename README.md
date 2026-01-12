# elaraSign

**Content Provenance Standard + Sovereign Signing Service**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cloud Run](https://img.shields.io/badge/GCP-Cloud%20Run-4285F4?logo=google-cloud)](https://cloud.google.com/run)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)

**Public Service**: [sign.openelara.org](https://sign.openelara.org)

---

> ⚡ **CONCEPT DEMONSTRATION** — This is a proof-of-concept showing how AI content provenance *should* work: **sovereign, secure, and accountable**. Use at your own risk. Fork it, make your own version, share improvements with the world.

---

## 🎯 What is elaraSign?

elaraSign is a **content provenance standard** that embeds generation metadata into files. It answers: *"How was this content created, and who witnessed it?"*

### Use It Three Ways

| Mode | For | How |
|------|-----|-----|
| 🌐 **Public Service** | Everyone | Use [sign.openelara.org](https://sign.openelara.org) - free, instant |
| 🖥️ **Your Own Cloud** | Organizations | Deploy your own instance on GCP (~$5/month) |
| 📦 **Embed in Code** | Developers | Copy `signing-core.ts` into your project |

---

## 🚀 Deploy Your Own Instance (15 Minutes)

**Requirements:** Google account + payment method (GCP free tier covers most usage)

### Total Cost Estimate

| Usage | Monthly Cost |
|-------|--------------|
| Light (< 1000 requests) | **Free** (within GCP free tier) |
| Medium (1000-10000 requests) | ~$5-15 |
| Heavy (10000+ requests) | ~$20-50 |

*Cloud Run charges only when your service is processing requests. No traffic = no cost.*

### Step 1: Run the Setup Wizard

```powershell
.\first-time-setup.ps1
```

The wizard will:
- ✅ Check Node.js, npm, gcloud CLI are installed
- ✅ Guide you through GCP project setup
- ✅ Let you pick your cloud region (🇺🇸 US, 🇪🇺 EU, 🇦🇺 Australia, etc.)
- ✅ Configure your organization identity
- ✅ Generate a signing certificate
- ✅ Tell you exactly what to do next

### Step 2: Deploy

```powershell
.\deploy.ps1
```

**That's it.** Your sovereign signing service is live at `https://your-project.run.app`

### What You Get

- 🔐 **Your own certificate** - Signatures trace back to YOUR organization
- 🌍 **Your chosen region** - Data stays where you need it
- 📊 **Your own logs** - Full audit trail in GCP
- 🎨 **Your own branding** - Customize the web UI
- 💰 **Your own costs** - Only pay for what you use

---

## 📦 Embed in Your Application

Don't want a cloud service? Just copy the signing code directly into your project.

### Option A: Copy the Core Module

```powershell
# Copy to your project
Copy-Item "src/core/signing-core.ts" "your-project/src/lib/"
```

Then use it:

```typescript
import { signImage, verifyImage } from './lib/signing-core';

// Sign an image
const signed = await signImage(imageBuffer, {
  method: 'ai',
  generator: 'my-app',
  model: 'stable-diffusion-xl',
  userFingerprint: sha256(userId),
  platformCode: 'my-platform'
});

// Verify an image
const result = await verifyImage(imageBuffer);
if (result.isValid) {
  console.log(`Signed by: ${result.metadata.generator}`);
  console.log(`Method: ${result.metadata.method}`);
}
```

### Option B: Webhook Integration

Call our public API (or your own instance) from any language:

```bash
# Sign an image
curl -X POST https://sign.openelara.org/api/sign \
  -F "file=@image.png" \
  -F "method=ai" \
  -F "generator=my-app"

# Verify an image  
curl -X POST https://sign.openelara.org/api/verify \
  -F "file=@signed-image.png"
```

### Option C: Self-Hosted API

Run elaraSign locally as a signing service for your application:

```bash
npm run dev  # Starts on http://localhost:3010
```

Your app calls `localhost:3010/api/sign` - works offline, no external dependencies.

📖 **Full integration guide**: [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md)

---

## 🛡️ What elaraSign Actually Does

### Metadata-Based Provenance

elaraSign embeds provenance information into file metadata. This is **transparent tracking**, not invisible watermarking.

| Content Type | Embedding Method | Verification |
|--------------|------------------|---------------|
| **Images** | EXIF/PNG tEXt chunks | EXIF viewers, elaraSign verifier |
| **PDF** | Document properties + optional visual stamp | PDF readers, EXIF tools |
| **Audio** | ID3 tags (MP3), INFO chunks (WAV) | Audio metadata tools |
| **Video** | Sidecar JSON manifest | elaraSign verifier |

### What Gets Embedded

Every signed file contains:
- **Generation Method**: `ai`, `human`, `mixed`, `unknown`
- **Generator**: Which tool/app created it
- **Timestamp**: When it was created (ISO 8601)
- **Content Hash**: SHA-256 fingerprint of original content
- **Witness Info**: Which service signed it, from where
- **Sidecar Bundle**: Full JSON manifest (always preserved)

---

## 🎯 Brutal Honesty

### What WORKS:
- ✅ Metadata embedding (EXIF, PNG chunks, PDF properties)
- ✅ Sidecar JSON bundles (100% reliable, can't be stripped without intent)
- ✅ Visual watermarks (optional, configurable)
- ✅ Survives basic editing (Paint, Preview, etc.)
- ✅ Survives renaming, moving, copying
- ✅ Verification via EXIF tools and elaraSign verifier

### What DOESN'T Work:
- ❌ Metadata stripped by screenshot (re-encoding)
- ❌ Metadata stripped by social media upload (re-compression)
- ❌ Not recognized as "Digital Signature" by Windows/Adobe (that requires PKI certificates)
- ❌ Can be intentionally stripped (metadata removal tools)

### What This Means

**elaraSign is a provenance record, not a tamper-proof seal.**

- If someone has a signed file + sidecar → provenance is verifiable
- If someone takes a screenshot → metadata is lost (sidecar still works if kept)
- If someone intentionally strips metadata → they're destroying evidence (suspicious)

**This is an accountability system for good actors, not a cage for bad actors.**

---

## 💡 Why This Matters

```
TODAY: Anyone can claim any image is real or AI-generated. No proof either way.

WITH ELARASIGN: Generation method is embedded at creation time.
                When adopted, AI images always show their provenance.
                Transparency becomes the default, not the exception.
```

### The Trust Model

elaraSign doesn't detect AI images - it **records provenance at generation time**.

- ✅ AI generators that adopt elaraSign → Always signed as AI
- ✅ Human artists can sign their work → Proves human creation  
- ⚠️ Bad actors can still lie → But they can't forge a legitimate signature
- 🎯 Goal: Make signing ubiquitous, so unsigned = suspicious

**When image APIs adopt this standard, the problem solves itself.**

---

## 📄 PDF Signing

elaraSign embeds provenance metadata into PDF document properties. This records WHO witnessed the document and WHEN.

### What You Get

| Feature | Description |
|---------|-------------|
| 📋 **Metadata Embedding** | Author, Creator, timestamps in PDF properties |
| 🔍 **EXIF Verification** | Detectable by metadata tools and elaraSign verifier |
| 🏛️ **Witness Model** | Service records it witnessed the document |
| 📦 **Sidecar Bundle** | Full JSON manifest for complete provenance |

### Current Status vs Future

| Feature | Status | Notes |
|---------|--------|-------|
| Metadata embedding | ✅ Works | Detectable by EXIF tools, elaraSign |
| Visual stamp | ✅ Works | Optional "Signed by elaraSign" watermark |
| PKCS#7 digital signature | 🔜 Roadmap | For Adobe/Windows recognition |
| CA-signed certificates | 🔜 Roadmap | For trusted certificate chain |

### Honest Assessment

**Current state**: elaraSign adds metadata to PDFs. This is verifiable by EXIF tools and our verifier, but NOT recognized as a "Digital Signature" by Adobe Reader or Windows (those require PKCS#7 cryptographic signatures with certificate chains).

**Roadmap**: True PKCS#7 digital signatures with proper certificate support is a future enhancement. When implemented, signatures would appear in Adobe Reader's signature panel.

📜 **Full legal notice**: [docs/LEGAL_NOTICE.md](docs/LEGAL_NOTICE.md)

---

## 📋 Supported Content

| Type | Status | What We Do | Verification |
|------|--------|------------|---------------|
| **Images** | ✅ Ready | EXIF/PNG metadata + sidecar JSON | EXIF tools, elaraSign verifier |
| **PDF** | ✅ Ready | Document properties + sidecar JSON | EXIF tools, elaraSign verifier |
| **Audio** | ✅ Ready | ID3/INFO metadata + sidecar JSON | Audio metadata tools |
| **Video** | ✅ Ready | Sidecar JSON manifest | elaraSign verifier |

**All content types also get a sidecar JSON bundle** - the most reliable provenance record.

---

## 🔧 API Reference

### Sign an Image

```bash
POST /api/sign
Content-Type: multipart/form-data

file: <image file>
generator: "my-app" (optional)
method: "ai" | "human" | "mixed" (optional, default: "ai")
```

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123",
  "downloadUrl": "/api/download/abc123",
  "sidecarUrl": "/api/sidecar/abc123"
}
```

### Verify an Image

```bash
POST /api/verify
Content-Type: multipart/form-data

file: <image file>
```

**Response:**
```json
{
  "isValid": true,
  "metadata": {
    "method": "ai",
    "generator": "my-app",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "contentHash": "abc123..."
  },
  "witness": {
    "serviceName": "elaraSign",
    "region": "us-central1",
    "country": "🇺🇸 United States"
  }
}
```

### Download Signed Image

```bash
GET /api/download/:sessionId
```

### Get Sidecar JSON

```bash
GET /api/sidecar/:sessionId
```

### Health Check

```bash
GET /health
```

Returns service status, region, and identity information.

---

## 🏗️ Architecture

```
elaraSign/
  src/
    core/           # THE signing standard (portable - copy to your projects)
      signing-core.ts       # Image signing (metadata) ⭐ COPY THIS
      pdf-signing.ts        # PDF metadata signing
      audio-signing.ts      # Audio signing (MP3/WAV)
      video-signing.ts      # Video signing (sidecar)
      service-identity.ts   # Witness identity management
      region-mapping.ts     # GCP region → country mapping
    cloud/          # Cloud Run service
      server.ts
      routes/
    testing/        # Test infrastructure
  web/              # Demo UI (customize for your branding)
  deploy/           # Deployment configuration
```

### How It Works (v2.0 Standard)

1. **Metadata created**: Generation method, timestamp, model, witness info
2. **Hashes computed**: Content hash + metadata hash (SHA-256)
3. **Metadata embedded**: Full provenance in EXIF/PNG chunks
4. **Sidecar generated**: JSON manifest with complete provenance record
5. **Witness recorded**: Service identity + geographic location

### Metadata Survival

Metadata survives basic editing (Paint, Preview, rename, copy) but is lost when files are re-encoded (screenshot, social media upload). The sidecar JSON bundle is always reliable if kept with the file.

### Code Flow (Copy, Don't Import)

```
elaraSign/src/core/signing-core.ts  ← CANONICAL SOURCE
    │
    │ COPY to (not npm install):
    │
    ├──→ openElara/src/lib/signing-core.ts
    ├──→ openElaraCloud/src/lib/signing-core.ts  
    └──→ YOUR PROJECT/src/lib/signing-core.ts
```

Each project has its **own copy**. No external dependencies.

---

## 🧪 Development

### Local Development

```bash
npm install         # Install dependencies
npm run dev         # Start server at http://localhost:3010
```

### Testing

```bash
npm test            # Run all tests (uses local signing, no API keys needed)
```

For integration tests with real AI providers:

```bash
npm run test -- --together-key=YOUR_KEY  # Test with Together.ai TTS
```

### Certificate Setup (For Production)

```powershell
.\setup-certificate.ps1   # Generates P12, uploads to Secret Manager
```

### Deployment Checklist

```powershell
.\preflight.ps1           # Verify gcloud is configured
.\deploy.ps1              # Build, test, deploy to Cloud Run
.\deploy-status.ps1       # Check deployment status
```

See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## 🌍 Part of the Elara Universe

| Project | Type | Signing |
|---------|------|---------|
| **elaraSign** | Public Service | Reference implementation (this repo) |
| **openElara** | Desktop App | Embedded signing |
| **openElaraCloud** | Cloud App | Embedded signing |

All projects use **identical copies** of the signing core - this repo is the source of truth.

---

## 📜 License & Philosophy

**MIT License** (Freeware/Shareware) - see [LICENSE](LICENSE) file.

### The Vision

This is **my version** of how AI content provenance should work. These are "rules from Heaven" - principles I believe should guide how AI-generated content is handled:

- **Sovereign**: You control your own signing infrastructure
- **Secure**: Cryptographic proof of provenance
- **Accountable**: Generation method recorded at creation time

### For Everyone

- ✅ **Free to use** - Use this standard, improve it, share it
- ✅ **Fork encouraged** - Make your own version, customize it
- ✅ **Bug fixes welcome** - Share improvements with the community

### Commercial Licensing

Building elaraSign into a commercial product? Contact for licensing inquiries:

📧 **openelara@applymytech.ai**

This email is also available for written confirmation of the freeware/shareware license terms.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

<div align="center">

*"Transparency is not optional. It's the foundation of trust."*

**[sign.openelara.org](https://sign.openelara.org)** | **[GitHub](https://github.com/applymytech/elaraSign)**

</div>
