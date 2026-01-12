# elaraSign

**Content Provenance Standard + Public Signing Service**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Live Service**: [sign.openelara.org](https://sign.openelara.org)

---

## What is elaraSign?

elaraSign is a **content provenance standard** that embeds generation metadata into files. It answers the question: *"How was this content created?"*

### 4-Layer Protection

| Layer | Name | Technique | Survives |
|-------|------|-----------|----------|
| 1 | **Billboard** | EXIF/PNG metadata | Basic sharing (easily stripped) |
| 2 | **DNA** | LSB steganography | Lossless only |
| 3 | **The Spread** | DCT spread spectrum | **JPEG, screenshots, cropping** |
| 4 | **Forensic** | AES-256 encrypted | Same as The Spread |

See [Full Architecture Docs](docs/WATERMARK_ARCHITECTURE.md)

### The Standard

Every signed file contains:
- **Generation Method**: `ai`, `human`, `mixed`, `unknown`
- **Generator**: Which tool/app created it
- **Timestamp**: When it was created
- **Integrity Hash**: Proof content hasn't been modified
- **Forensic Data**: Encrypted accountability (IP, fingerprint) - operator only

---

## Brutal Honesty

### What SURVIVES (The Spread layer):
- JPEG compression (>50% quality)
- Screenshots
- Cropping
- Social media upload
- Format conversion

### What DOES NOT survive:
- Heavy blur or noise
- Extreme compression (<50% JPEG)
- Rotation/perspective transforms
- AI regeneration (img2img)
- Print and re-scan
- Dedicated removal attacks

**This is a deterrent and accountability system, not magic.**

### The Service

This repository provides a **free public signing service** at [sign.openelara.org](https://sign.openelara.org):
- Upload an image -> Get it signed with provenance metadata
- Upload a signed image -> Verify its authenticity and view metadata

---

## Getting Started

### First Time? Run the Setup Wizard

```powershell
# Option 1: Run directly
.\first-time-setup.ps1

# Option 2: Or use npm
npm run setup
```

The wizard will:
- Check if Node.js, npm, and optional tools are installed
- Give you clear instructions if anything is missing
- Install dependencies (npm install)
- Help you configure deployment (optional)
- Tell you exactly what to do next

### Quick Start (Experienced Developers)

```bash
# 1. Clone the repo
git clone https://github.com/openelara/elara-sign.git
cd elara-sign

# 2. Install dependencies  
npm install

# 3. Run locally
npm run dev

# Opens at http://localhost:3010
```

### That's It!

You now have a local signing service. Upload images, sign them, verify them. The web UI explains everything.

---

## Why This Matters

```
TODAY: Anyone can claim any image is real or AI-generated. No proof either way.

WITH ELARASIGN: Generation method is embedded at creation time.
                When adopted, AI images always show their provenance.
                Transparency becomes the default, not the exception.
```

### The Trust Model

elaraSign doesn't detect AI images - it **records provenance at generation time**.

- AI generators that adopt elaraSign -> Always signed as AI
- Human artists can sign their work -> Proves human creation
- Bad actors can still lie -> But they can't forge a legitimate signature
- Goal: Make signing ubiquitous, so unsigned = suspicious

**When image APIs adopt this standard, the problem solves itself.**

---

## Supported Content

| Type | Status | Layers | Notes |
|------|--------|--------|-------|
| **Images** | Ready | 4-layer (Billboard, DNA, Spread, Forensic) | PNG, JPEG, WebP - full spread-spectrum watermarking |
| **PDF** | Ready | 3-layer (/Info, XMP, Hidden Annotation) | Professional metadata signing |
| **Audio** | Ready | Surface metadata (ID3, INFO chunks) | MP3, WAV - no spread-spectrum |
| **Video** | Scaffold | Sidecar manifest + container metadata | Sidecar works now, full signing future |

---

## How It Works

### Signing (v2.0 Standard)

1. **Metadata created**: Generation method, timestamp, model, etc.
2. **Hashes computed**: Content hash + metadata hash (SHA-256)
3. **Signature embedded**: 48-byte compact binary in 3 locations
4. **PNG chunks added**: Full metadata in standard PNG text chunks

### Multi-Location Redundancy

```
+------+---------------------------------+------+
| LOC1 |                                 | LOC2 |
| TL   |                                 | TR   |
+------+                                 +------+
|                                               |
|              YOUR IMAGE                       |
|                                               |
+-----------------+------+---------------------+
|                 | LOC3 |                     |
|                 | BC   |                     |
+-----------------+------+---------------------+

Any ONE location surviving = Valid signature
Trolls must crop ALL THREE corners to remove provenance
```

---

## API Reference

### Sign an Image

```bash
POST /api/sign
Content-Type: multipart/form-data

file: <image file>
generator: "my-app" (optional)
method: "ai" | "human" | "mixed" (optional, default: "ai")
```

### Verify an Image

```bash
POST /api/verify
Content-Type: multipart/form-data

file: <image file>
```

### Download Signed Image

```bash
GET /api/download/:sessionId
```

### Get Sidecar JSON

```bash
GET /api/sidecar/:sessionId
```

---

## Architecture

```
elaraSign/
  src/
    core/           # THE signing standard (portable)
      signing-core.ts       # Image signing (4-layer)
      pdf-signing.ts        # PDF signing
      audio-signing.ts      # Audio signing (MP3/WAV)
      video-signing.ts      # Video signing (scaffold)
    cloud/          # Cloud Run service
      server.ts
      routes/
    testing/        # Test runner and helpers
      test-runner.ts        # API-based testing
      helper.ts             # Diagnostics
    local/          # CLI tool (future)
  web/              # Demo UI
  deploy/           # Cloud Run deployment
```

### Code Flow

```
elaraSign/src/core/signing-core.ts  <- CANONICAL SOURCE (images)
elaraSign/src/core/pdf-signing.ts   <- PDF signing
elaraSign/src/core/audio-signing.ts <- Audio signing
    |
    | COPY to (not import):
    |
    +---> openElara Desktop (src/lib/)
    +---> openElaraCloud (src/lib/)
```

---

## Development

### Local Development

```bash
npm run dev           # Start server with hot-reload at http://localhost:3010
```

### Testing

Tests require API keys because they call real AI APIs to generate content,
sign it, and verify the signatures work end-to-end.

```bash
# See all test options
npm run test:help

# Run tests with Together.ai (generates real TTS audio, signs it, verifies)
npm run test -- --together-key=YOUR_KEY

# Run with multiple providers
npm run test -- --together-key=xxx --openai-key=yyy

# With Exa for error diagnosis if tests fail
npm run test -- --together-key=xxx --exa-key=zzz
```

**Get API keys:**
- Together.ai: https://api.together.xyz/settings/api-keys (free tier available)
- OpenAI: https://platform.openai.com/api-keys
- Exa (optional): https://dashboard.exa.ai/api-keys

**Your API keys are secure:**
- Passed via CLI or env vars only
- Used only during test runtime  
- Never written to disk or logs

**What gets tested:**
1. Generate audio via Together.ai or OpenAI TTS API
2. Sign that audio with elaraSign
3. Verify signature is readable and metadata is correct
4. Artifacts saved to test-output/ (playable audio files)

### Helper Commands

```bash
npm run helper:status     # View recent test runs
npm run helper:diagnose   # Analyze failures with solutions
npm run helper -- explain --error="401 Unauthorized"
```

### Cloud Deployment

First time deploying? Run these in order:

```powershell
.\preflight.ps1       # Check gcloud is configured correctly
.\deploy.ps1          # Build, test, and deploy to Cloud Run
```

See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## Technical Details

### Signing Format: v2.0

- **48-byte compact binary** embedded in image pixels
- **3 locations**: top-left, top-right, bottom-center
- **Crop-resilient**: Any 1 location surviving = valid signature
- **Metadata**: content hash, meta hash, timestamp, generator, method

### Supported Formats

| Format | Sign | Verify | Notes |
|--------|------|--------|-------|
| PNG | Yes | Yes | Full support |
| JPEG | Yes | Yes | Lossy compression may degrade some locations |
| WebP | Yes | Yes | Full support |

---

## Part of the Elara Universe

| Project | Type | Signing |
|---------|------|---------|
| **elaraSign** | Public Service | Reference implementation (this repo) |
| **openElara** | Desktop App | Embedded signing |
| **openElaraCloud** | Cloud App | Embedded signing |

All projects use **identical copies** of `signing-core.ts` - this repo is the source of truth.

---

## License

MIT License - Use this standard freely. The more adoption, the better for everyone.

---

*"Transparency is not optional. It's the foundation of trust."*
