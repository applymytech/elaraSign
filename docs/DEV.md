# elaraSign - Local Development

## Quick Start

```bash
# 1. Start Firestore emulator (in terminal 1)
npm run dev:full

# 2. Set secrets as environment variables (in terminal 2)
export ELARASIGN_MASTER_KEY=$(gcloud secrets versions access latest --secret=elarasign-master-key --project=elarasign-prod)
export ELARASIGN_P12_BASE64=$(gcloud secrets versions access latest --secret=elarasign-p12-certificate --project=elarasign-prod)
export ELARASIGN_P12_PASSWORD=$(gcloud secrets versions access latest --secret=elarasign-p12-password --project=elarasign-prod)
export FIRESTORE_EMULATOR_HOST=localhost:8080

# 3. Start server
npm run dev
```

## What Gets Used

| Component | Local Dev | Production |
|-----------|-----------|------------|
| Secrets (P12, master key) | From GCP Secret Manager | From Cloud Run env vars |
| Firestore (user auth docs) | Emulator @ localhost:8080 | Live Firestore |
| Signed file storage | In-memory sessions | In-memory sessions |

## Why Two Terminals?

- **Terminal 1 (emulator)**: Firestore emulator runs in foreground, logs DB operations
- **Terminal 2 (server)**: Server connects to emulator automatically via `FIRESTORE_EMULATOR_HOST`

The server auto-detects the emulator through the environment variable. No code changes needed.

## Simplified from Previous Version

**Before** (120 lines, dev.ts):
- Fetched secrets via gcloud commands inside script
- Spawned emulator subprocess
- Complex process management
- Required specific terminal setup

**Now** (simple):
- Two terminals, clean separation
- Standard Firebase emulator workflow
- Server auto-detects emulator
- Explicit, no magic

## What If I Don't Start the Emulator?

The server will try to connect to live Firestore. Only user auth documents get written (email, lastLogin), so it's not dangerous, but:

- You'll pollute live DB with test users
- You'll see warnings in console

**Best practice**: Always run the emulator.

## Testing Without Firebase

If you just want to test signing/verification (no auth):

```bash
export ELARASIGN_MASTER_KEY=$(gcloud secrets versions access latest --secret=elarasign-master-key)
export ELARASIGN_P12_BASE64=$(gcloud secrets versions access latest --secret=elarasign-p12-certificate)
export ELARASIGN_P12_PASSWORD=$(gcloud secrets versions access latest --secret=elarasign-p12-password)

npm run dev
```

Visit http://localhost:3010 - the UI works in "anonymous mode" without login.
