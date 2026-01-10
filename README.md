# elaraSign

**Universal File Signing Service + Open Source Library**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🎯 What is elaraSign?

elaraSign is the **canonical implementation** of the Elara signing standard - a content signing system that embeds provenance metadata into files (primarily images).

### Features

- **🌐 Cloud Service** - Public API for signing files
- **💻 Local CLI** - Offline signing tool
- **📦 Library** - Import signing logic into your own apps
- **🔍 Verification** - Validate signed files haven't been modified
- **🛡️ Crop-Resilient** - 3-location embedding survives partial cropping

---

## 📦 Installation

### CLI Tool

```bash
npm install -g elara-sign

# Sign a file
elara-sign sign ./my-image.png

# Verify a file
elara-sign verify ./my-image.png
```

### Library

```bash
npm install elara-sign
```

```typescript
import { signImage, verifySignature } from 'elara-sign';

// Sign an image
const result = await signImage(imageBuffer, {
  generator: 'my-app',
  model: 'flux-schnell'
});

// Verify
const verification = await verifySignature(signedImage);
console.log(verification.isValid); // true
```

---

## 🌐 Cloud Service

**Production**: https://sign.openelara.com  
**Staging**: https://sign-dev.openelara.com

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sign` | POST | Sign a file |
| `/api/verify` | POST | Verify a signed file |
| `/api/download/:id` | GET | Download signed file |
| `/api/sidecar/:id` | GET | Download JSON sidecar |

### Quick Example

```bash
# Sign a file
curl -X POST https://sign.openelara.com/api/sign \
  -F "file=@image.png" \
  -o signed-image.png

# Verify a file  
curl -X POST https://sign.openelara.com/api/verify \
  -F "file=@signed-image.png"
```

---

## 🏗️ Architecture

```
elaraSign/
├── src/
│   ├── core/           # Signing logic (portable)
│   │   ├── signing-core.ts
│   │   └── signing-core.test.ts
│   ├── cloud/          # Cloud service
│   │   ├── server.ts
│   │   └── routes/
│   └── local/          # CLI tool
│       └── commands/
├── docs/               # Documentation
├── deploy/             # Deployment configs
└── web/                # Web UI
```

---

## 🔧 Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start local server
npm run dev

# Build CLI
npm run build:cli
```

---

## 📋 Technical Details

### Signing Format: v2.0

- **48-byte compact binary** embedded in image pixels
- **3 locations**: top-left, top-right, bottom-center
- **Crop-resilient**: Any 1 location surviving = valid signature
- **Metadata**: content hash, meta hash, timestamp, generator

### Supported Formats

| Format | Sign | Verify | Notes |
|--------|------|--------|-------|
| PNG | ✅ | ✅ | Full support |
| JPEG | ✅ | ✅ | Lossy compression may affect some locations |
| WebP | 🔜 | 🔜 | Planned |

---

## 🌌 Elara Universe

elaraSign is part of the OpenElara ecosystem:

| Project | Type | Purpose |
|---------|------|---------|
| **elaraSign** | This repo | Canonical signing service |
| [elaraSDEngineTest](../elaraSDEngineTest) | Tool | SD generation testing |
| [openElara](../openElara) | Desktop App | Full AI assistant |
| [openElaraCloud](../openElaraCloud) | Cloud App | Web AI assistant |

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
