# Archived Validation Scripts

These files were used during development to validate the signing logic.
They are NOT shipped to users - they're reference material for future development.

## What's Here

| File | Purpose | Date Archived |
|------|---------|---------------|
| signing-core.test.ts.txt | Image signing validation with synthetic PNG data | 2026-01-11 |
| document-signing.test.ts.txt | PDF/audio/video format validation | 2026-01-11 |
| audio-signing.test.ts.txt | Audio format handling validation | 2026-01-11 |
| pdf-signing.test.ts.txt | PDF signing validation | 2026-01-11 |
| real-audio-test.ts.txt | Audio test with programmatic WAV/MP3 | 2026-01-11 |
| real-pdf-test.ts.txt | PDF test with programmatic files | 2026-01-11 |

## Why Archived

These scripts use programmatically-generated test files (synthetic data).
They were useful for building and validating the core logic, but:

1. They don't prove the system works with real AI-generated content
2. Users don't need internal validation tools
3. Users get production-grade `npm test` which calls real APIs

## When to Reference

Pull these out when:
- Building new validation for new formats
- Debugging format-specific issues
- Understanding how the signing logic was validated during development

## What Users Get Instead

Users run `npm test -- --together-key=KEY` which:
- Calls real AI APIs (Together.ai, OpenAI)
- Generates real content
- Signs it and verifies signatures
- Proves the system works end-to-end
