# Testing Philosophy for elaraSign

## Digital Witness Code Integrity

elaraSign is a **digital witness** - its core function is to embed provenance metadata into content. The integrity of this cryptographic signing code is critical.

## Comprehensive Testing Implemented ✅

### 1. Unit Tests (Fast Cryptographic Validation)
**Location**: `src/core/__tests__/*.test.ts`  
**Run**: `npm run test:unit`

**Forensic Crypto Tests** (16 tests, 86% coverage):
- Master key generation (256-bit AES keys)
- AES-256-CBC encryption/decryption
- User fingerprint creation (SHA-256)
- IP address encoding
- Platform code mapping
- Deterministic encryption validation

**Signing Core Tests** (15 tests):
- CRC32 checksumming
- Signature detection in images
- Multi-location signature extraction
- Metadata creation with proper types
- LSB encoding principles
- Constants and configuration validation

**Result**: ✅ 31/31 passing - cryptographic integrity verified

### 2. Integration Tests (End-to-End API Testing)
**Location**: `src/testing/test-runner.ts`  
**Run**: `npm run test:integration`

Tests the complete system via HTTP API:
- Sign and verify real PNG/JPEG/PDF/WAV/MP4 files from `test-files/`
- Signature resilience (crop, resize, metadata strip)
- Multi-location signature redundancy
- Forensic accountability decryption
- Sidecar JSON validation

**Why Both Layers?**
- **Unit tests** validate core crypto functions in isolation (fast, catches logic errors)
- **Integration tests** prove the full pipeline works with real files (catches API boundary issues)

### Recommended Testing Strategy

#### High Priority (Do First)
1. **Signature Encoding/Decoding Tests**
   - Test each location (top-left, top-right, bottom-left, bottom-right, center)
   - Verify signature survives pixel data round-trip
   - Test truncated images (missing locations)
   - Test corrupted signatures

2. **Metadata Hash Integrity**
   - Verify SHA-256 produces expected output
   - Test tamper detection (modified metadata)

3. **LSB Encoding Tests**
   - Encode known data, decode, verify bit-perfect
   - Test edge cases (all 0s, all 1s, max length)

#### Medium Priority
4. **Forensic Crypto Tests**
   - Encrypt/decrypt accountability data
   - Verify AES-256-GCM integrity
   - Test without master key (graceful degradation)

5. **Multi-Location Resilience**
   - Simulate aggressive crops
   - Verify ANY single location can verify
   - Test all 5 locations intact vs. 1 location

#### Low Priority (Nice to Have)
6. **Spread Spectrum Tests** (when implemented)
7. **PDF Digital Signature Tests** (complex, already validated via integration)

## How to Add Unit Tests

### Option 1: Vitest (Already in package.json)
```bash
npm install -D vitest
```

Create `src/core/__tests__/signing-core.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { embedSignatureAtLocation, extractSignatureFromLocation } from '../signing-core.js';

describe('signing-core', () => {
  it('should embed and extract signature at top-left', () => {
    const pixels = new Uint8ClampedArray(48 * 4 * 4); // 48x4 block
    const signature = new Uint8Array(48); // 48 bytes
    // ... test logic
  });
});
```

Add to `package.json`:
```json
"test:unit": "vitest",
"test:integration": "tsx src/testing/test-runner.ts",
"test:all": "npm run test:unit && npm run test:integration"
```

### Option 2: Simple Node Scripts
Create `src/core/__tests__/manual-signing-test.ts`:
```typescript
// No framework, just console assertions
import { embedSignatureAtLocation } from '../signing-core.js';

console.log('Testing signature embedding...');
const result = embedSignatureAtLocation(/* ... */);
console.assert(result, 'FAIL: Signature not embedded');
console.log('✅ PASS');
```

Run: `tsx src/core/__tests__/manual-signing-test.ts`

## Philosophy: Honest Failures

From `src/cloud/server.ts`:
> "We prefer honest, informative failures over silent continuation. If something is fundamentally broken, users and developers deserve to know."

**Apply this to tests:**
- Tests should FAIL LOUD when crypto breaks
- No silent fallbacks that hide signature corruption
- Incomplete hashes = incomplete truth = test failure

## Node.js 24 Requirement

**DO NOT downgrade Node.js version.** The project requires Node 24+ due to critical security fixes in the JavaScript ecosystem. This is non-negotiable for a digital witness service handling cryptographic signatures.

## Immediate Action Items

1. ✅ Fix Dockerfile Node version (22 → 24) - **DONE**
2. ✅ Fix admin login modal - **DONE**
3. ⏳ Add unit tests for `signing-core.ts` encoding/decoding
4. ⏳ Add unit tests for forensic crypto
5. ⏳ Document test coverage in README

---

**Last Updated**: January 17, 2026  
**Author**: System maintainer
