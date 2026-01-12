# elaraSign Integration Guide

**Three ways to integrate elaraSign into your application**

---

## 🎯 Choose Your Integration Pattern

| Pattern | Best For | Complexity | Dependencies |
|---------|----------|------------|--------------|
| **Embed Code** | Full control, offline capability | Medium | Copy TypeScript files |
| **Webhook/API** | Language-agnostic, quick setup | Low | HTTP client only |
| **Self-Hosted Service** | Team/org deployment | Medium | Docker or Cloud Run |

---

## 📦 Pattern 1: Embed Code (Recommended)

Copy the signing core directly into your project. No npm package, no external dependencies at runtime.

### Step 1: Copy the Files

```powershell
# Image signing (the main one)
Copy-Item "src/core/signing-core.ts" "your-project/src/lib/"

# Optional: PDF signing
Copy-Item "src/core/pdf-signing.ts" "your-project/src/lib/"
Copy-Item "src/core/pdf-digital-signature.ts" "your-project/src/lib/"

# Optional: Audio signing
Copy-Item "src/core/audio-signing.ts" "your-project/src/lib/"
```

### Step 2: Install Dependencies

```bash
# For image signing
npm install sharp

# For PDF signing (optional)
npm install pdf-lib

# For PKCS#7 PDF signatures (optional)
npm install @signpdf/signpdf @signpdf/placeholder-pdf-lib @signpdf/signer-p12 node-forge
```

### Step 3: Use in Your Code

```typescript
import { signImage, verifyImage } from './lib/signing-core';
import crypto from 'node:crypto';

// Helper to create user fingerprint
function createFingerprint(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

// Sign an AI-generated image
async function signGeneratedImage(imageBuffer: Buffer, userId: string) {
  const result = await signImage(imageBuffer, {
    method: 'ai',
    generator: 'my-app-v1.0',
    model: 'stable-diffusion-xl',
    userFingerprint: createFingerprint(userId),
    platformCode: 'my-platform',
    timestamp: new Date().toISOString()
  });
  
  return result.signedImage;  // Buffer with embedded provenance
}

// Verify an uploaded image
async function checkProvenance(imageBuffer: Buffer) {
  const result = await verifyImage(imageBuffer);
  
  if (result.isValid) {
    console.log('✅ Signed image detected');
    console.log(`   Method: ${result.metadata.method}`);
    console.log(`   Generator: ${result.metadata.generator}`);
    console.log(`   Timestamp: ${result.metadata.timestamp}`);
  } else {
    console.log('⚠️ No valid signature found');
  }
  
  return result;
}
```

### Full Example: Express Middleware

```typescript
import express from 'express';
import multer from 'multer';
import { signImage, verifyImage } from './lib/signing-core';
import crypto from 'node:crypto';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to auto-sign all image uploads
app.post('/upload', upload.single('image'), async (req, res) => {
  const userId = req.user?.id || 'anonymous';
  
  const signed = await signImage(req.file.buffer, {
    method: 'human',  // User-uploaded content
    generator: 'my-app',
    userFingerprint: crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32),
    platformCode: 'my-platform'
  });
  
  // Store signed.signedImage instead of raw upload
  await saveToStorage(signed.signedImage);
  
  res.json({ success: true, contentHash: signed.contentHash });
});

// Endpoint to verify any image
app.post('/verify', upload.single('image'), async (req, res) => {
  const result = await verifyImage(req.file.buffer);
  res.json(result);
});
```

---

## 🌐 Pattern 2: Webhook/API Integration

Call elaraSign's API from any language. Use the public service or your own deployment.

### Base URLs

| Environment | URL |
|-------------|-----|
| Public Service | `https://sign.openelara.org` |
| Self-Hosted | `https://your-project.run.app` |
| Local Dev | `http://localhost:3010` |

### Sign an Image

**Request:**
```bash
curl -X POST https://sign.openelara.org/api/sign \
  -F "file=@image.png" \
  -F "method=ai" \
  -F "generator=my-app" \
  -F "model=dall-e-3"
```

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123def456",
  "downloadUrl": "/api/download/abc123def456",
  "sidecarUrl": "/api/sidecar/abc123def456",
  "metadata": {
    "method": "ai",
    "generator": "my-app",
    "model": "dall-e-3",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "contentHash": "a1b2c3d4..."
  }
}
```

**Download the signed image:**
```bash
curl https://sign.openelara.org/api/download/abc123def456 -o signed-image.png
```

### Verify an Image

**Request:**
```bash
curl -X POST https://sign.openelara.org/api/verify \
  -F "file=@signed-image.png"
```

**Response (valid signature):**
```json
{
  "isValid": true,
  "confidence": "high",
  "metadata": {
    "method": "ai",
    "generator": "my-app",
    "model": "dall-e-3",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "contentHash": "a1b2c3d4...",
    "metaHash": "e5f6g7h8..."
  },
  "witness": {
    "serviceName": "elaraSign",
    "serviceVersion": "2.0.0",
    "region": "us-central1",
    "country": "🇺🇸 United States"
  }
}
```

**Response (no signature):**
```json
{
  "isValid": false,
  "reason": "no_signature_found"
}
```

### Python Example

```python
import requests

def sign_image(image_path: str, method: str = "ai", generator: str = "my-app"):
    """Sign an image using elaraSign API"""
    with open(image_path, 'rb') as f:
        response = requests.post(
            'https://sign.openelara.org/api/sign',
            files={'file': f},
            data={'method': method, 'generator': generator}
        )
    
    result = response.json()
    if result['success']:
        # Download the signed image
        signed = requests.get(f"https://sign.openelara.org{result['downloadUrl']}")
        return signed.content
    else:
        raise Exception(result.get('error', 'Signing failed'))

def verify_image(image_path: str):
    """Verify an image's provenance"""
    with open(image_path, 'rb') as f:
        response = requests.post(
            'https://sign.openelara.org/api/verify',
            files={'file': f}
        )
    return response.json()

# Usage
signed_bytes = sign_image('generated.png', method='ai', generator='stable-diffusion')
with open('signed.png', 'wb') as f:
    f.write(signed_bytes)

result = verify_image('signed.png')
print(f"Valid: {result['isValid']}")
```

### JavaScript/Node.js Example

```javascript
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

async function signImage(imagePath, options = {}) {
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));
  form.append('method', options.method || 'ai');
  form.append('generator', options.generator || 'my-app');
  
  const response = await fetch('https://sign.openelara.org/api/sign', {
    method: 'POST',
    body: form
  });
  
  const result = await response.json();
  
  if (result.success) {
    const signed = await fetch(`https://sign.openelara.org${result.downloadUrl}`);
    return Buffer.from(await signed.arrayBuffer());
  }
  
  throw new Error(result.error || 'Signing failed');
}

async function verifyImage(imagePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));
  
  const response = await fetch('https://sign.openelara.org/api/verify', {
    method: 'POST',
    body: form
  });
  
  return response.json();
}

// Usage
const signed = await signImage('generated.png', { method: 'ai', generator: 'dall-e' });
fs.writeFileSync('signed.png', signed);

const result = await verifyImage('signed.png');
console.log(`Valid: ${result.isValid}`);
```

---

## 🖥️ Pattern 3: Self-Hosted Service

Run your own signing service for your team or organization.

### Option A: Local Development Server

```bash
cd elaraSign
npm install
npm run dev   # Runs on http://localhost:3010
```

Point your apps at `http://localhost:3010/api/*`.

### Option B: Docker Container

```bash
docker build -t elarasign .
docker run -p 3010:3010 elarasign
```

### Option C: Cloud Run (Production)

```powershell
.\first-time-setup.ps1   # Configure GCP project + region
.\deploy.ps1             # Deploy to Cloud Run
```

Your service runs at `https://your-project.run.app`.

### Benefits of Self-Hosting

| Benefit | Description |
|---------|-------------|
| 🔐 Your Certificate | Signatures trace to YOUR organization |
| 🌍 Your Region | Data stays in your jurisdiction |
| 📊 Your Logs | Full audit trail |
| 🎨 Your Branding | Customize the web UI |
| 🔒 Your Security | Behind your firewall if needed |

---

## 🔒 Security Considerations

### User Fingerprints

Always hash user IDs before embedding:

```typescript
// ✅ CORRECT - hashed, not reversible
const fingerprint = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32);

// ❌ WRONG - never embed raw user IDs
const fingerprint = userId;  // Don't do this!
```

### IP Hashing

If recording client IPs, use daily-salted hashes:

```typescript
function hashIp(ip: string): string {
  const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  const salted = `elarasign:ip:${ip}:${today}`;
  return crypto.createHash('sha256').update(salted).digest('hex').slice(0, 32);
}
```

### Certificate Security

For production PKCS#7 signatures:
- Store P12 certificates in Secret Manager (GCP) or equivalent
- Never commit certificates to git
- Rotate certificates annually
- Use CA-signed certificates for legal documents

---

## 📚 API Reference

### POST /api/sign

Sign a file with provenance metadata.

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Image/PDF/audio file |
| method | string | No | `ai`, `human`, `mixed`, `unknown` (default: `ai`) |
| generator | string | No | Application name |
| model | string | No | AI model used |
| userCode | string | No | Custom identifier |

**Response:**
```typescript
{
  success: boolean;
  sessionId: string;
  downloadUrl: string;
  sidecarUrl: string;
  metadata: {
    method: string;
    generator: string;
    timestamp: string;
    contentHash: string;
  }
}
```

### POST /api/verify

Verify a file's signature and extract metadata.

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | File to verify |

**Response:**
```typescript
{
  isValid: boolean;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;  // If invalid
  metadata?: {
    method: string;
    generator: string;
    timestamp: string;
    contentHash: string;
    metaHash: string;
  };
  witness?: {
    serviceName: string;
    serviceVersion: string;
    region: string;
    country: string;
  }
}
```

### GET /health

Service health and identity information.

**Response:**
```typescript
{
  status: 'ok';
  version: string;
  timestamp: string;
  location: {
    region: string;
    country: string;
    flag: string;
  };
  identity: {
    serviceName: string;
    organizationName: string;
    canSignPkcs7: boolean;
  }
}
```

---

## ❓ FAQ

**Q: Do I need an API key?**  
A: No. The public service and self-hosted instances don't require authentication.

**Q: What's the file size limit?**  
A: 50MB for the public service. Self-hosted: configurable.

**Q: Can I use this commercially?**  
A: Yes. MIT license allows commercial use.

**Q: Is the signature legally binding?**  
A: Technical compatibility with legal standards exists, but legal validity depends on your jurisdiction and use case. Consult legal counsel for legally binding documents.

**Q: How do I verify in the browser?**  
A: Use the web UI at [sign.openelara.org](https://sign.openelara.org) or call the API from JavaScript.

---

## 🤝 Support

- **Documentation**: [README.md](README.md)
- **Issues**: [GitHub Issues](https://github.com/applymytech/elaraSign/issues)
- **Architecture**: [docs/WATERMARK_ARCHITECTURE.md](docs/WATERMARK_ARCHITECTURE.md)
