# Testing Guide

## Philosophy

**elaraSign does NOT generate content. It SIGNS content.**

Tests verify that signing and verification work correctly using real files
that you provide. There are no fake tests, no synthetic data, no mocked
responses. When you run tests, actual files are signed through the HTTP API.

## Quick Start

1. **Add test files** to `test-files/` directory (at minimum, one PNG)
2. **Start the server**: `npm run dev`
3. **Run tests**: `npx tsx src/testing/test-runner.ts`

## Test Files

Place your test files in the `test-files/` directory:

```
test-files/
  sample.png          [REQUIRED] PNG image - gold standard
  sample.jpg          [optional] JPEG image
  sample.webp         [optional] WebP image
  sample.pdf          [optional] PDF document
  sample.mp3          [optional] MP3 audio
  sample.wav          [optional] WAV audio
```

See `test-files/README.md` for details on what files to use.

## Running Tests

### Basic Test (sign + verify all files)

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run tests
npx tsx src/testing/test-runner.ts
```

### Verbose Mode (see all layer details)

```bash
npx tsx src/testing/test-runner.ts --verbose
```

### Test Against Production

```bash
npx tsx src/testing/test-runner.ts --server=https://sign.openelara.org
```

### Skip Conversion Test (faster)

```bash
npx tsx src/testing/test-runner.ts --skip-conversion
```

### All Options

```bash
npx tsx src/testing/test-runner.ts --help
```

## What Gets Tested

### Per File

1. **[SIGN]** Upload file to `POST /api/sign`
2. **[DOWNLOAD]** Download signed file from `/api/download/:sessionId`
3. **[VERIFY]** Verify signature via `POST /api/verify`
4. **[LAYERS]** Check all signature layers are present

### PNG Gold Standard (additional)

5. **[CONVERT]** Convert signed PNG to JPEG (lossy)
6. **[SURVIVAL]** Verify which signature layers survive JPEG compression

## Signature Layers

### Images (4 layers)

| Layer | Name | Survives JPEG? | Purpose |
|-------|------|----------------|---------|
| 1 | Billboard | No | EXIF/IPTC/XMP, PNG tEXt - visible in Windows Properties |
| 2 | DNA | No | LSB steganography - 3 locations, crop-resilient |
| 3 | Spread Spectrum | **YES** | DCT frequency domain - survives screenshots, social media |
| 4 | Forensic | No | AES-256 encrypted - only operator can decrypt |

### PDFs (2 layers)

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | PDF Comments | ELARA_SIGN block in PDF header |
| 2 | /Info Dictionary | Standard PDF metadata fields |

### Audio (1 layer)

| Format | Layer | Purpose |
|--------|-------|---------|
| MP3 | ID3 tags | ID3v2 metadata with elaraSign fields |
| WAV | INFO chunks | RIFF INFO chunk with provenance data |

### Video (sidecar)

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | .elara.json | External manifest with content hash |

## Test Outputs

After running tests, check `test-output/run-{timestamp}/`:

| File | Description |
|------|-------------|
| `diagnostic-log.json` | Full test results, timing, layer status |
| `signed-sample.png` | Signed PNG (all 4 layers) |
| `converted-sample.jpg` | PNG converted to JPEG (survival test) |
| `signed-sample.pdf` | Signed PDF |

## Verifying Individual Files

Use the standalone verifier to check any file:

```bash
# Basic verification
npx tsx src/testing/verifier.ts image.png

# Verbose (show all layers)
npx tsx src/testing/verifier.ts image.png --verbose

# JSON output (for scripting)
npx tsx src/testing/verifier.ts image.png --json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Valid signature |
| 1 | NOT signed |
| 2 | Signed but TAMPERED |
| 3 | Error reading file |

## Helper Tool

For diagnostics when tests fail:

```bash
# View status
npx tsx src/testing/helper.ts status

# Diagnose failures
npx tsx src/testing/helper.ts diagnose

# Get help for specific error
npx tsx src/testing/helper.ts explain --error="500 Internal Server Error"

# AI-powered diagnosis (requires Exa key)
npx tsx src/testing/helper.ts diagnose --exa-key=YOUR_KEY
```

## Common Issues

### "No test files found"
Add at least one PNG file to `test-files/` directory.

### "Server not responding"
Make sure the server is running: `npm run dev`

### "Sign API error (413)"
File too large. Maximum is 50MB.

### "Verification failed: signature not detected"
The signing process may have failed. Check server logs.

## Survival Test Explanation

The PNG to JPEG survival test demonstrates elaraSign's layered approach:

1. **PNG signed** with all 4 layers
2. **Converted to JPEG** (lossy compression)
3. **What survives**:
   - Billboard: LOST (PNG chunks don't exist in JPEG, EXIF may be stripped)
   - DNA (LSB): LOST (JPEG compression destroys least-significant bits)
   - Spread Spectrum: **SURVIVES** (DCT watermark embedded in frequency domain)
   - Forensic: LOST (stored in PNG chunks)

This is why the Spread Spectrum layer matters - it's the "trap" that catches
bad actors who screenshot or re-save images to strip metadata.

## Architecture

```
test-runner.ts      Main test orchestration
    |
    +-- POST /api/sign      Upload file, get signed version
    |       |
    |       +-- signing-core.ts, pdf-signing.ts, etc.
    |
    +-- GET /api/download   Download signed file
    |
    +-- POST /api/verify    Verify signature layers
            |
            +-- signing-core.ts verification

verifier.ts         Standalone verification tool
    |
    +-- Direct imports from core signing modules
```

## Adding New File Types

When elaraSign adds support for new file types:

1. Add MIME type mapping in `test-runner.ts` in `MIME_TYPES`
2. Add verification logic in `verifier.ts` switch case
3. Update `/api/sign` route if needed
4. Add sample file to `test-files/README.md` examples
