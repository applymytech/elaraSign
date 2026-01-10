# elaraSign - Copilot Instructions

## ⚠️ CRITICAL: This is the CANONICAL Signing Implementation

```
╔════════════════════════════════════════════════════════════════════════════════╗
║                        CANONICAL SOURCE PRINCIPLE                               ║
║                                                                                 ║
║  🏠 elaraSign = THE authoritative signing implementation                        ║
║                                                                                 ║
║  ✅ All signing logic is developed and proven HERE                              ║
║  ✅ Other apps COPY from here (they don't import)                               ║
║  ✅ This is both a library AND a cloud service                                  ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

## Project Overview

elaraSign provides:
1. **Core Library** - `src/core/signing-core.ts` - The signing logic
2. **Cloud Service** - `src/cloud/` - Public API at sign.openelara.com
3. **CLI Tool** - `src/local/` - Offline signing command

## Architecture

```
elaraSign/
├── src/
│   ├── core/               # CANONICAL signing logic
│   │   ├── signing-core.ts      # THE implementation
│   │   └── signing-core.test.ts # THE tests
│   ├── cloud/              # Cloud service
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── sign.ts
│   │   │   ├── verify.ts
│   │   │   └── download.ts
│   │   └── storage/
│   │       └── session-manager.ts
│   ├── local/              # CLI tool
│   │   ├── index.ts
│   │   └── commands/
│   └── index.ts            # Library exports
├── docs/                   # Documentation
├── deploy/                 # Deployment configs
└── web/                    # Web UI (optional)
```

## Code Flow

```
elaraSign/src/core/signing-core.ts (CANONICAL)
    │
    │ COPY to other projects (not import)
    │
    ├──► openElara/src/lib/signing-core.ts
    ├──► openElaraCloud/src/lib/signing-core.ts
    └──► elaraSDEngineTest/src/core/signing-core.ts
```

## Key Principles

1. **This is the source of truth** for signing logic
2. **Other apps copy** the signing-core.ts file, they don't import it
3. **Tests must pass** here before copying to other projects
4. **Cloud service** uses the same core logic as the library

## Development Workflow

### Updating Signing Logic
```bash
# 1. Edit src/core/signing-core.ts
# 2. Run tests
npm test

# 3. If tests pass, copy to other projects
Copy-Item "src/core/signing-core.ts" "c:\myCodeProjects\openElara\src\lib\"
Copy-Item "src/core/signing-core.ts" "c:\myCodeProjects\openElaraCloud\src\lib\"
```

### Running the Cloud Service
```bash
npm run dev
# Server starts at http://localhost:3000
```

### Building CLI
```bash
npm run build:cli
# Test with: npx elara-sign --help
```

## Related Projects

| Project | Relationship |
|---------|--------------|
| **openElara** | Desktop app - receives signing-core.ts copy |
| **openElaraCloud** | Cloud app - receives signing-core.ts copy |
| **elaraSDEngineTest** | Testing tool - receives signing-core.ts copy |
| **architecture-review** | Universe docs & engineering tools |
