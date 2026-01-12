# Legal Notice & Compliance Information

## Overview

elaraSign is a content provenance system that embeds generation metadata into digital files. This document clarifies what elaraSign is and is not from a legal perspective.

---

## What elaraSign Provides

### Technical Capabilities

| Feature | Description |
|---------|-------------|
| **Metadata Embedding** | Provenance information in EXIF/PNG/PDF properties |
| **SHA-256 Hashes** | Content fingerprint for integrity checking |
| **Timestamp Recording** | ISO 8601 timestamp at signing time |
| **Witness Attribution** | Records which service witnessed the signing |
| **Sidecar Bundles** | JSON manifest with complete provenance record |

### What This Means

elaraSign records provenance (who created what, when, how) in file metadata. This is:
- ✅ Verifiable by metadata tools and elaraSign verifier
- ✅ Useful for audit trails and transparency
- ❌ NOT a cryptographic digital signature (like DocuSign)
- ❌ NOT recognized by Windows/Adobe as "digitally signed"

---

## What elaraSign Does NOT Provide

### Not Provided

⚠️ **elaraSign does NOT provide:**

1. **PKCS#7/CMS cryptographic signatures** (roadmap feature)
2. **Adobe-recognized digital signatures** (roadmap feature)
3. **Legal validity** of signatures in any jurisdiction
4. **Qualified Electronic Signature (QES)** status under eIDAS
5. **Identity verification** of signers
6. **Non-repudiation** in legal proceedings

### Regulatory Compliance

elaraSign is **NOT certified** under:

| Framework | Status | Notes |
|-----------|--------|-------|
| eIDAS (EU) | ❌ Not certified | No QTSP status |
| E-SIGN Act (US) | ⚠️ Technical only | No legal guarantee |
| UETA (US States) | ⚠️ Technical only | No legal guarantee |
| Adobe AATL | ❌ Not a member | Self-signed certificates show as "untrusted" |

---

## Current Status and Roadmap

### Current: Metadata Provenance

elaraSign currently embeds provenance in file metadata:
- ✅ Verifiable by EXIF tools and elaraSign verifier
- ⚠️ NOT recognized as "Digital Signature" by Adobe/Windows

### Roadmap: Cryptographic Signatures

Future versions may include:
- 🔜 PKCS#7 cryptographic signatures
- 🔜 Adobe-visible signature panel integration
- 🔜 Certificate chain support

---

## Recommended Use Cases

### ✅ Appropriate Uses

| Use Case | Notes |
|----------|-------|
| Content provenance tracking | Recording generation method (AI/human) |
| Internal document workflows | Tracking who signed what, when |
| Audit trails | Recording timestamps and witness information |
| AI transparency | Marking AI-generated content |
| Development and testing | Prototyping signature workflows |

### ⚠️ Not Appropriate (Currently)

| Use Case | Why |
|----------|-----|
| Legal contracts | Need cryptographic signatures + identity verification |
| Compliance documents | Need recognized digital signatures |
| Cross-border legal docs | Need qualified electronic signatures |

---

## Jurisdiction Notes

Electronic signature requirements vary by jurisdiction. elaraSign provides **provenance tracking**, not legally binding signatures. For legal use cases, consult legal counsel.

---

## Liability Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

elaraSign and its contributors:

- Make no representations about legal validity
- Do not guarantee regulatory compliance
- Are not responsible for how signatures are used
- Do not provide legal advice

**For legally binding electronic signatures, consult:**
- A qualified legal professional in your jurisdiction
- A Qualified Trust Service Provider (QTSP) for eIDAS compliance
- Your organization's legal/compliance team

---

## Contact

**Technical questions:**
- GitHub Issues: [https://github.com/applymytech/elaraSign/issues](https://github.com/applymytech/elaraSign/issues)

**Commercial licensing inquiries:**
- 📧 openelara@applymytech.ai

**Written confirmation of freeware/shareware license:**
- 📧 openelara@applymytech.ai

**Legal advice:**
- Consult a qualified attorney in your jurisdiction

---

## Philosophy

> ⚡ **CONCEPT DEMONSTRATION**
>
> This is a proof-of-concept demonstrating how AI content provenance *should* work.
> These are "rules from Heaven" — principles for making AI **sovereign, secure, and accountable**.
>
> - Use at your own risk
> - Fork it, make your own version
> - Share bug fixes and improvements
> - The more adoption, the better for everyone

---

*Last updated: January 2026*
