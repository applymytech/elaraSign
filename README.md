# elaraSign

**Content Provenance Standard + Public Signing Service**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🌐 **Live Service**: [sign.openelara.org](https://sign.openelara.org)

---

## 🎯 What is elaraSign?

elaraSign is a **content provenance standard** that embeds generation metadata into files. It answers the question: *"How was this content created?"*

### 4-Layer Protection

| Layer | Name | Technique | Survives |
|-------|------|-----------|----------|
| 1 | **Billboard** | EXIF/PNG metadata | Basic sharing (easily stripped) |
| 2 | **DNA** | LSB steganography | Lossless only |
| 3 | **The Spread** | DCT spread spectrum | **JPEG, screenshots, cropping** |
| 4 | **Forensic** | AES-256 encrypted | Same as The Spread |

📖 **[Full Architecture Docs](docs/WATERMARK_ARCHITECTURE.md)**

### The Standard

Every signed file contains:
- **Generation Method**: `ai`, `human`, `mixed`, `unknown`
- **Generator**: Which tool/app created it
- **Timestamp**: When it was created
- **Integrity Hash**: Proof content hasn't been modified
- **Forensic Data**: Encrypted accountability (IP, fingerprint) - operator only

---

## ⚠️ Brutal Honesty

### What SURVIVES (The Spread layer):
- ✅ JPEG compression (>50% quality)
- ✅ Screenshots
- ✅ Cropping
- ✅ Social media upload
- ✅ Format conversion

### What DOES NOT survive:
- ❌ Heavy blur or noise
- ❌ Extreme compression (<50% JPEG)
- ❌ Rotation/perspective transforms
- ❌ AI regeneration (img2img)
- ❌ Print and re-scan
- ❌ Dedicated removal attacks

**This is a deterrent and accountability system, not magic.**

### The Service

This repository provides a **free public signing service** at [sign.openelara.org](https://sign.openelara.org):
- Upload an image → Get it signed with provenance metadata
- Upload a signed image → Verify its authenticity and view metadata

---

## 🌍 Why This Matters

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

## 📋 Supported Content

| Type | Status | Notes |
|------|--------|-------|
| **Images** | ✅ Ready | PNG, JPEG, WebP |
| **PDF** | 🔜 Planned | Metadata in document properties |
| **Video** | 🔜 Planned | Frame-level + file-level signing |
| **Audio** | 🔜 Planned | Waveform embedding |

**Current Focus: Images** - AI images are trivial to create and impossible to distinguish. We solve this first.

---

## 🔧 How It Works

### Signing (v2.0 Standard)

1. **Metadata created**: Generation method, timestamp, model, etc.
2. **Hashes computed**: Content hash + metadata hash (SHA-256)
3. **Signature embedded**: 48-byte compact binary in 3 locations
4. **PNG chunks added**: Full metadata in standard PNG text chunks

### Multi-Location Redundancy

```
┌──────┐─────────────────────────────────┌──────┐
│ LOC1 │                                 │ LOC2 │
│ TL   │                                 │ TR   │
└──────┘                                 └──────┘
│                                               │
│              YOUR IMAGE                       │
│                                               │
├─────────────────┌──────┐─────────────────────┤
│                 │ LOC3 │                     │
│                 │ BC   │                     │
└─────────────────└──────┘─────────────────────┘

Any ONE location surviving = Valid signature
Trolls must crop ALL THREE corners to remove provenance
```

---

## 🌐 API Reference

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

## 🏗️ Architecture

```
elaraSign/
├── src/
│   ├── core/           # THE signing standard (portable)
│   │   ├── signing-core.ts
│   │   └── signing-core.test.ts
│   ├── cloud/          # Cloud Run service
│   │   ├── server.ts
│   │   └── routes/
│   └── local/          # CLI tool (future)
├── web/                # Demo UI
└── deploy/             # Cloud Run deployment
```

### Code Flow

```
elaraSign/src/core/signing-core.ts  ← CANONICAL SOURCE
    │
    │ COPY to (not import):
    │
    ├──► openElara Desktop (src/lib/)
    └──► openElaraCloud (src/lib/)
```

---

## 🚀 Development

```bash
# Install dependencies
npm install

# Run tests (12/12 should pass)
npm test

# Start local server
npm run dev
# Server at http://localhost:3010
```

---

## 📋 Technical Details

### Signing Format: v2.0

- **48-byte compact binary** embedded in image pixels
- **3 locations**: top-left, top-right, bottom-center
- **Crop-resilient**: Any 1 location surviving = valid signature
- **Metadata**: content hash, meta hash, timestamp, generator, method

### Supported Formats

| Format | Sign | Verify | Notes |
|--------|------|--------|-------|
| PNG | ✅ | ✅ | Full support |
| JPEG | ✅ | ✅ | Lossy compression may degrade some locations |
| WebP | ✅ | ✅ | Full support |

---

## 🌌 Part of the Elara Universe

| Project | Type | Signing |
|---------|------|---------|
| **elaraSign** | Public Service | Reference implementation (this repo) |
| **openElara** | Desktop App | Embedded signing |
| **openElaraCloud** | Cloud App | Embedded signing |

All projects use **identical copies** of `signing-core.ts` - this repo is the source of truth.

---

## 📄 License

MIT License - Use this standard freely. The more adoption, the better for everyone.

---

*"Transparency is not optional. It's the foundation of trust."*
