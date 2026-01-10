# elaraSign Watermark Architecture

## 🎯 4-Layer Protection System

elaraSign uses a **4-layer defense** to ensure provenance data survives various attacks and transformations.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIGNED IMAGE                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Layer 1: BILLBOARD (EXIF/PNG tEXt)                        │  │
│  │ • Visible in Windows Properties, Adobe, ExifTool          │  │
│  │ • Easily stripped - marketing/trust signal only           │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Layer 2: DNA (LSB Steganography)                          │  │
│  │ • Hidden in LSB of blue channel, 3 locations              │  │
│  │ • Survives lossless operations only                       │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Layer 3: THE SPREAD (DCT Spread Spectrum)                 │  │
│  │ • Encrypted data spread across frequency domain           │  │
│  │ • SURVIVES: JPEG, screenshots, cropping, social media     │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Layer 4: FORENSIC PAYLOAD (AES-256 Encrypted)             │  │
│  │ • Accountability data: IP, timestamp, fingerprint         │  │
│  │ • Only operator can decrypt with master key               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Details

### Layer 1: Billboard (Public Metadata)

**Purpose**: Marketing and trust signal for casual verification

**Location**: 
- PNG: tEXt chunks (visible in Windows Properties → Details)
- JPEG: EXIF/IPTC fields

**Contains**:
- Generation method (AI/Human/Mixed)
- Generator/tool name
- Model name
- Timestamp
- Copyright notice linking to elaraSign

**Survivability**:
| Operation | Survives? |
|-----------|-----------|
| Direct file sharing | ✅ Yes |
| Some image editors | ✅ Yes |
| Social media upload | ❌ Usually stripped |
| Metadata removal tools | ❌ No |

**Honest Assessment**: This layer is easily stripped. Its purpose is to make legitimate files look professional and provide easy verification for people who don't try to hide anything.

---

### Layer 2: DNA (LSB Steganography)

**Purpose**: Hidden verification for Elara ecosystem tools

**Technique**: Least Significant Bit embedding in blue channel

**Location**: 3 redundant positions (top-left, top-right, bottom-center)

**Contains**:
- 48-byte compact signature
- Content hash
- Metadata hash
- Timestamp

**Survivability**:
| Operation | Survives? |
|-----------|-----------|
| Lossless PNG operations | ✅ Yes |
| Mild cropping (1 location survives) | ✅ Yes |
| JPEG compression | ❌ Degrades |
| Screenshots | ❌ No |
| Any lossy operation | ❌ No |

**Honest Assessment**: This is our "sovereign proof" that only Elara tools can verify, but it only survives pristine conditions. It's the first layer that fails under attack.

---

### Layer 3: The Spread (DCT Spread Spectrum Watermarking)

**Purpose**: THE TRAP - Survives most attacks

**Technique**: Frequency domain embedding using Discrete Cosine Transform (DCT)

**How It Works**:
1. Image divided into 8×8 pixel blocks (like JPEG)
2. Each block transformed to frequency domain
3. Pseudo-random pattern (seeded by metaHash) modulates mid-band DCT coefficients
4. Pattern spread across ALL blocks with 8× redundancy
5. Extraction correlates against known pattern

**Contains**:
- Encrypted forensic payload (32 bytes)
- Timestamp, IP, fingerprint, platform

**Survivability**:
| Operation | Survives? |
|-----------|-----------|
| JPEG compression (>50% quality) | ✅ Yes |
| Screenshots | ✅ Yes |
| Cropping | ✅ Yes (pattern is redundant) |
| Social media upload | ✅ Usually yes |
| Format conversion | ✅ Yes |
| Mild scaling (>50% size) | ✅ Yes |
| Heavy blur | ❌ No |
| Extreme compression (<50%) | ❌ Degrades |
| Rotation/perspective | ❌ No |
| AI regeneration (img2img) | ❌ No |
| Print and re-scan | ❌ No |
| Intentional removal attacks | ❌ Possibly not |

**Honest Assessment**: This is the real protection. A predator who screenshots an image, compresses it, or crops it STILL has the forensic pattern embedded. But it's not magic - dedicated attacks can remove it.

---

### Layer 4: Forensic Payload

**Purpose**: Law enforcement accountability

**Encryption**: AES-256-CBC with master key from Google Secret Manager

**Contains** (32 bytes total):
- 4 bytes: Unix timestamp
- 4 bytes: IPv4 address
- 8 bytes: User fingerprint (truncated hash)
- 1 byte: Platform code
- 15 bytes: Checksum + reserved

**Access**: Only the system operator with the master key can decrypt

**Use Case**:
```
1. Illegal content found with elaraSign watermark
2. Law enforcement requests information
3. Operator extracts spread spectrum pattern using metaHash
4. Operator decrypts forensic payload with master key
5. Returns: IP address, timestamp, session fingerprint
```

---

## Survivability Matrix

| Attack | Billboard | DNA (LSB) | The Spread | Forensic |
|--------|-----------|-----------|------------|----------|
| Direct sharing | ✅ | ✅ | ✅ | ✅ |
| JPEG 80% | ❌ | ❌ | ✅ | ✅ |
| Screenshot | ❌ | ❌ | ✅ | ✅ |
| Social media | ❌ | ❌ | ✅ | ✅ |
| Crop (center) | ❌ | ⚠️ | ✅ | ✅ |
| Crop (all corners) | ❌ | ❌ | ✅ | ✅ |
| Heavy blur | ❌ | ❌ | ❌ | ❌ |
| AI img2img | ❌ | ❌ | ❌ | ❌ |

---

## The Trap Flow

```
Creator signs image on elaraSign
           ↓
All 4 layers embedded
           ↓
Bad actor downloads it
           ↓
Takes screenshot? → The Spread survives
           ↓
Compresses to JPEG? → The Spread survives
           ↓
Crops the middle? → The Spread survives (redundant pattern)
           ↓
Strips metadata? → The Spread survives (it's IN the pixels)
           ↓
Uploads to social media? → The Spread usually survives
           ↓
Law enforcement requests info
           ↓
Operator decrypts forensic payload
           ↓
IP address, timestamp, fingerprint revealed
```

---

## Master Key Management

The forensic system uses a **single master key** stored in Google Secret Manager:

- **Generated once** per deployment
- **Never regenerated** (old images would be orphaned)
- **Bound to Cloud Run** via cloudbuild.yaml
- **Viewable** in Google Cloud Console by operator

```bash
# View key in console
https://console.cloud.google.com/security/secret-manager/secret/elarasign-master-key/versions

# Or via CLI (if you have access)
gcloud secrets versions access latest --secret=elarasign-master-key
```

---

## Honest Limitations

### What This System IS:
- A multi-layer provenance system
- A deterrent for casual bad actors
- An accountability trail for serious incidents
- A trust signal for legitimate content

### What This System IS NOT:
- Unbreakable (nothing is)
- A replacement for legal protection
- Effective against sophisticated state actors
- A solution if someone re-generates content with AI

### The Real Goal

When image generation APIs adopt this standard at creation time:
1. Every AI image is signed before the user can touch it
2. Unsigned images become suspicious by default
3. The forensic trail provides accountability
4. Transparency becomes the norm

---

## Technical References

- **DCT Spread Spectrum**: Based on techniques used by Digimarc, similar to JPEG compression
- **LSB Steganography**: Classic technique, simple but fragile
- **AES-256-CBC**: Industry standard encryption
- **PNG tEXt chunks**: W3C standard for PNG metadata

---

*Version: 2.0 (Spread Spectrum)*
*Status: UNTESTED - Needs production validation*
