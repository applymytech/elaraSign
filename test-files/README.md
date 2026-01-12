# Test Files Directory

This directory contains **standard unsigned test files** for elaraSign validation.
These files are designed to test all supported signing formats.

## Standard Test Files

| File | Type | Size | Purpose |
|------|------|------|---------|
| `sample-ai-generated.png` | PNG | 1.3 MB | Gold standard - metadata embedding test |
| `sample-ai-generated.jpg` | JPEG | 134 KB | EXIF injection |
| `sample-ai-generated.webp` | WebP | 1 MB | WebP XMP metadata |
| `sample-avatar.png` | PNG | 1.2 MB | Secondary PNG test |
| `sample-small.png` | PNG | 109 KB | Minimum size handling |
| `sample-document.pdf` | PDF | 1 KB | PDF metadata signing |
| `sample-audio.wav` | WAV | 172 KB | Audio metadata |
| `sample-video-short.mp4` | MP4 | 2.6 MB | Video sidecar |
| `sample-video-long.mp4` | MP4 | 5.4 MB | Large file handling |

## What Gets Tested

| File Type | Signing Method | What's Verified |
|-----------|---------------|-----------------|
| **PNG** | PNG tEXt chunks + EXIF | Metadata survives basic editing |
| **JPEG** | EXIF metadata | Metadata survives basic editing |
| **WebP** | XMP metadata | Metadata survives lossless WebP |
| **PDF** | Document properties | Author, Creator, timestamps |
| **WAV** | INFO chunks | Metadata in RIFF INFO |
| **MP4** | Sidecar (.elara.json) | External JSON manifest |

**Note:** Metadata does NOT survive screenshot or re-encoding. Keep sidecar JSON for reliable provenance.

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
