# Test Files Directory

This directory contains **standard unsigned test files** for elaraSign validation.
These files are designed to test all supported signing formats.

## Standard Test Files

| File | Type | Size | Purpose |
|------|------|------|---------|
| `sample-ai-generated.png` | PNG | 1.3 MB | Gold standard - full 4-layer test |
| `sample-ai-generated.jpg` | JPEG | 134 KB | EXIF injection, lossy format |
| `sample-ai-generated.webp` | WebP | 1 MB | Lossless WebP |
| `sample-avatar.png` | PNG | 1.2 MB | Secondary PNG test |
| `sample-small.png` | PNG | 109 KB | Minimum size handling |
| `sample-document.pdf` | PDF | 1 KB | PDF signing |
| `sample-audio.wav` | WAV | 172 KB | Audio metadata (future) |
| `sample-video-short.mp4` | MP4 | 2.6 MB | Video sidecar (future) |
| `sample-video-long.mp4` | MP4 | 5.4 MB | Large file handling |

## What Gets Tested

| File Type | Signing Method | What's Verified |
|-----------|---------------|-----------------|
| **PNG** | 4-layer (Billboard, DNA, Spread, Forensic) | All layers, tamper detection, conversion survival |
| **JPEG** | Billboard (EXIF) + DNA + Spread | Signed but LSB lost (expected - lossy format) |
| **WebP** | DNA (lossless) | Signature survives lossless WebP |
| **PDF** | PDF comments + /Info dictionary | Signature block in PDF |
| **WAV** | INFO chunks | Metadata in RIFF INFO (API pending) |
| **MP4** | Sidecar (.elara.json) | External manifest (API pending) |

## Shipping These Files

These standard test files ship with all Elara apps for validation:
- Copy entire `test-files/` directory to target app
- Run test suite against local or production server
- Ensures signing works correctly in any deployment

## Source

Generated from `architecture-review/docs/test content/standard/`
See `manifest.json` for full metadata.

## Quick Start

```bash
# Start the server in one terminal
npm run dev

# Run tests in another terminal
npx tsx src/testing/test-runner.ts
```

## Test Modes

### Basic Test (sign + verify)
```bash
npx tsx src/testing/test-runner.ts
```

### Verbose Mode (see all layer details)
```bash
npx tsx src/testing/test-runner.ts --verbose
```

### Skip Conversion Test (faster)
```bash
npx tsx src/testing/test-runner.ts --skip-conversion
```

### Test Against Production
```bash
npx tsx src/testing/test-runner.ts --server=https://sign.openelara.org
```

## Verifying Individual Files

Use the verifier tool to check any signed file:

```bash
npx tsx src/testing/verifier.ts signed-image.png --verbose
```

Exit codes:
- `0` = Valid signature
- `1` = Not signed
- `2` = Tampered
- `3` = Error
