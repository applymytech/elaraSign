# elaraSign - Copilot Instructions

## ⚠️ CRITICAL: This is the Content Provenance Standard

```
╔════════════════════════════════════════════════════════════════════════════════╗
║                        ELARASIGN = PROVENANCE STANDARD                          ║
║                                                                                 ║
║  🎯 Purpose: Embed generation metadata into content                             ║
║  🌐 Service: Public cloud signing at sign.openelara.org                         ║
║  📋 Focus: IMAGES FIRST (then PDF, then video)                                  ║
║                                                                                 ║
║  This is NOT "AI detection" - it's provenance tracking.                         ║
║  Generation method can be: ai, human, mixed, unknown                            ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

## What elaraSign IS

1. **A Content Provenance Standard** - Embeds generation metadata into files
2. **A Public Cloud Service** - Free signing/verification at sign.openelara.org
3. **The Canonical Implementation** - Other Elara apps copy this code
4. **Image-First** - Solving the biggest problem (AI images) before PDF/video

## What elaraSign is NOT

- ❌ NOT "AI detection" (we record provenance, not detect it)
- ❌ NOT an npm package (cloud service focus)
- ❌ NOT a CLI tool (scaffolding only, not priority)

## Architecture

```
elaraSign/
├── src/
│   ├── core/                 # THE signing standard (portable)
│   │   ├── signing-core.ts   # CANONICAL - copy to other apps
│   │   └── signing-core.test.ts
│   ├── cloud/                # Cloud Run service
│   │   ├── server.ts
│   │   └── routes/
│   └── local/                # CLI (scaffolding, low priority)
├── web/                      # Demo UI (Elara branding)
└── deploy/                   # Cloud Run deployment
```

## Code Flow (IMPORTANT)

```
elaraSign/src/core/signing-core.ts  ← CANONICAL SOURCE
    │
    │ COPY to (never import):
    │
    ├──► openElara/src/lib/signing-core.ts
    └──► openElaraCloud/src/lib/signing-core.ts
```

**Each app has its OWN COPY. This is CORRECT.**

## Deployment

- **Platform**: Google Cloud Run
- **Project**: elarasign (same Google account as openElaraCloud, different project)
- **Domain**: sign.openelara.org
- **Deploy**: `./deploy.ps1`

## The Trust Model

```
elaraSign doesn't detect AI images - it records provenance at creation time.

✅ AI generators that adopt elaraSign → Always signed as AI
✅ Human artists can sign their work → Proves human creation
⚠️ Bad actors can still lie → But they can't forge a legitimate signature
🎯 Goal: When adopted widely, unsigned = suspicious
```

## Current Status

| Component | Status |
|-----------|--------|
| signing-core.ts | ✅ Complete (12/12 tests) |
| Cloud server | ✅ Complete |
| API routes | ✅ Complete |
| Web UI | ✅ Complete (needs Elara branding) |
| Cloud Run deploy | 🔜 Setting up |
| CLI tool | ⏸️ Low priority (scaffolding) |

## Testing

```bash
# Run signing tests
npm test

# Start local server
npm run dev
# http://localhost:3010
```

## Branding

Follow the Elara Universe branding (see openElaraCloud login page for reference):
- Dark theme (#1a1a2e background)
- Cyan accent (#00d4aa)
- Professional but approachable
- "Transparency is not optional" tagline
