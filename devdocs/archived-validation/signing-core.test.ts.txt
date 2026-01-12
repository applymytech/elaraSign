/**
 * ElaraSign Standard v2.0 - Test Suite
 * =====================================
 * Tests multi-location signing, crop resilience, and backwards compatibility.
 * 
 * Run with: npx tsx src/signing-core.test.ts
 * 
 * @version 2.0.0
 */

import {
  // Constants
  ELARA_MARKER,
  ELARA_VERSION,
  SIGNATURE_LOCATIONS,
  MIN_IMAGE_SIZE,
  SIGNATURE_LAYOUT,
  LOCATION_IDS,
  
  // Utilities
  crc32,
  sha256Hex,
  sha256Bytes,
  
  // Core v2 signing
  packSignatureForLocation,
  unpackSignature,
  embedMultiLocationSignature,
  extractMultiLocationSignature,
  
  // High-level API
  signImageContent,
  verifyImageContent,
  hasElaraSignature,
  readSignature,
  
  // Metadata utilities
  createMetadata,
  createUserFingerprint,
  createPromptHash,
  
  // Backwards compatibility
  extractV1Signature,
  hasAnyElaraSignature,
  
  // Types
  ElaraContentMetadata,
} from './signing-core';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestImageData(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;     // R
    data[i + 1] = 200; // G
    data[i + 2] = 100; // B (this channel holds our signature)
    data[i + 3] = 255; // A
  }
  return data;
}

/** Simulate cropping by zeroing out a region */
function cropRegion(
  imageData: Uint8ClampedArray, 
  width: number, 
  height: number,
  cropX: number, 
  cropY: number, 
  cropWidth: number, 
  cropHeight: number
): Uint8ClampedArray {
  const cropped = new Uint8ClampedArray(imageData);
  for (let y = cropY; y < cropY + cropHeight && y < height; y++) {
    for (let x = cropX; x < cropX + cropWidth && x < width; x++) {
      const idx = (y * width + x) * 4;
      cropped[idx] = 0;
      cropped[idx + 1] = 0;
      cropped[idx + 2] = 0;
      cropped[idx + 3] = 255;
    }
  }
  return cropped;
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTests() {
  console.log('🧪 ElaraSign Standard v2.0 - Test Suite\n');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  // ========================================================================
  // Test 1: CRC-32 Checksum
  // ========================================================================
  console.log('\n📋 Test 1: CRC-32 Checksum');
  try {
    const testData = new Uint8Array([0x31, 0x32, 0x33, 0x34]); // "1234"
    const checksum = crc32(testData);
    console.log(`   Input: [0x31, 0x32, 0x33, 0x34] ("1234")`);
    console.log(`   CRC-32: 0x${checksum.toString(16).toUpperCase().padStart(8, '0')}`);
    
    // Known CRC-32 of "1234" is 0x9BE3E0A3
    if (checksum === 0x9BE3E0A3) {
      console.log('   ✅ CRC-32 produces correct checksum');
      passed++;
    } else {
      throw new Error(`Expected 0x9BE3E0A3, got 0x${checksum.toString(16)}`);
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 2: SHA-256 Hashing
  // ========================================================================
  console.log('\n📋 Test 2: SHA-256 Hashing');
  try {
    const hash = await sha256Hex('hello world');
    console.log(`   Input: "hello world"`);
    console.log(`   SHA-256: ${hash.slice(0, 32)}...`);
    const expectedPrefix = 'b94d27b9';
    if (hash.startsWith(expectedPrefix)) {
      console.log('   ✅ SHA-256 produces correct hash');
      passed++;
    } else {
      throw new Error(`Expected prefix ${expectedPrefix}, got ${hash.slice(0, 8)}`);
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 3: Pack/Unpack Signature v2.0
  // ========================================================================
  console.log('\n📋 Test 3: Signature Packing v2.0');
  try {
    const metadata = '{"test": "metadata", "version": "2.0"}';
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    
    const packed = await packSignatureForLocation(metadata, content, LOCATION_IDS.topLeft);
    console.log(`   Packed signature: ${packed.data.length} bytes`);
    console.log(`   Location ID: ${packed.locationId}`);
    console.log(`   Meta hash: ${packed.metaHash.slice(0, 16)}...`);
    console.log(`   Content hash: ${packed.contentHash.slice(0, 16)}...`);
    console.log(`   Timestamp: ${new Date(packed.timestamp * 1000).toISOString()}`);
    
    const unpacked = unpackSignature(packed.data);
    if (!unpacked) throw new Error('Failed to unpack signature');
    
    console.log(`   Unpacked marker: "${unpacked.marker}"`);
    console.log(`   Unpacked version: 0x${unpacked.version.toString(16).padStart(2, '0')}`);
    console.log(`   Checksum valid: ${unpacked.isValid ? '✅' : '❌'}`);
    
    if (unpacked.marker === ELARA_MARKER && 
        unpacked.version === ELARA_VERSION &&
        unpacked.isValid) {
      console.log('   ✅ Pack/Unpack roundtrip successful');
      passed++;
    } else {
      throw new Error('Roundtrip verification failed');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 4: Multi-Location Embedding
  // ========================================================================
  console.log('\n📋 Test 4: Multi-Location Embedding');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    const metadata = '{"generator": "test", "version": "2.0"}';
    const contentBytes = new Uint8Array(imageData);
    
    console.log(`   Image size: ${width}x${height}`);
    
    const result = await embedMultiLocationSignature(
      imageData, width, height, metadata, contentBytes
    );
    
    console.log(`   Locations embedded: ${result.locationsEmbedded.join(', ')}`);
    console.log(`   Meta hash: ${result.metaHash}`);
    
    if (result.locationsEmbedded.length === 3) {
      console.log('   ✅ All 3 locations embedded');
      passed++;
    } else {
      throw new Error(`Expected 3 locations, got ${result.locationsEmbedded.length}`);
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 5: Multi-Location Extraction
  // ========================================================================
  console.log('\n📋 Test 5: Multi-Location Extraction');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    // Sign the image
    const metadata = createMetadata({
      generator: 'elara.desktop',
      userFingerprint: 'test-fp',
      keyFingerprint: 'test-key',
      contentType: 'image',
      contentHash: 'abc123',
      characterId: 'elara',
      modelUsed: 'test-model',
      promptHash: 'def456',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    // Extract
    const extracted = extractMultiLocationSignature(imageData, width, height);
    
    console.log(`   Valid locations: ${extracted.validLocations.join(', ')}`);
    console.log(`   Invalid locations: ${extracted.invalidLocations.join(', ') || 'none'}`);
    console.log(`   Best signature marker: ${extracted.bestSignature?.marker}`);
    
    if (extracted.validLocations.length === 3 && extracted.bestSignature?.isValid) {
      console.log('   ✅ All 3 locations extracted and valid');
      passed++;
    } else {
      throw new Error(`Expected 3 valid locations, got ${extracted.validLocations.length}`);
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 6: Crop Resilience - Top-Left Cropped
  // ========================================================================
  console.log('\n📋 Test 6: Crop Resilience - Top-Left Corner Cropped');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    const metadata = createMetadata({
      generator: 'elara.desktop',
      userFingerprint: 'test-fp',
      keyFingerprint: 'test-key',
      contentType: 'image',
      contentHash: 'abc123',
      characterId: 'elara',
      modelUsed: 'test-model',
      promptHash: 'def456',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    // Crop top-left corner (destroys location 1)
    const cropped = cropRegion(imageData, width, height, 0, 0, 50, 10);
    
    const extracted = extractMultiLocationSignature(cropped, width, height);
    console.log('   Cropped region: 0,0 to 50,10 (destroys top-left)');
    console.log(`   Valid locations remaining: ${extracted.validLocations.join(', ')}`);
    
    // Should still have 2 valid locations (top-right, bottom-center)
    if (extracted.validLocations.length >= 2 && hasElaraSignature(cropped, width, height)) {
      console.log('   ✅ Signature survives top-left crop');
      passed++;
    } else {
      throw new Error('Signature lost after cropping');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 7: Crop Resilience - Top-Right Cropped
  // ========================================================================
  console.log('\n📋 Test 7: Crop Resilience - Top-Right Corner Cropped');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    const metadata = createMetadata({
      generator: 'elara.desktop',
      userFingerprint: 'test-fp',
      keyFingerprint: 'test-key',
      contentType: 'image',
      contentHash: 'abc123',
      characterId: 'elara',
      modelUsed: 'test-model',
      promptHash: 'def456',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    // Crop top-right corner (destroys location 2)
    const cropped = cropRegion(imageData, width, height, width - 10, 0, 10, 40);
    
    const extracted = extractMultiLocationSignature(cropped, width, height);
    console.log('   Cropped region: top-right 10x40 (destroys top-right)');
    console.log(`   Valid locations remaining: ${extracted.validLocations.join(', ')}`);
    
    if (extracted.validLocations.length >= 2 && hasElaraSignature(cropped, width, height)) {
      console.log('   ✅ Signature survives top-right crop');
      passed++;
    } else {
      throw new Error('Signature lost after cropping');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 8: Crop Resilience - Bottom-Center Cropped
  // ========================================================================
  console.log('\n📋 Test 8: Crop Resilience - Bottom-Center Cropped');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    const metadata = createMetadata({
      generator: 'elara.desktop',
      userFingerprint: 'test-fp',
      keyFingerprint: 'test-key',
      contentType: 'image',
      contentHash: 'abc123',
      characterId: 'elara',
      modelUsed: 'test-model',
      promptHash: 'def456',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    // Crop bottom-center (destroys location 3)
    const centerX = Math.floor((width - 32) / 2);
    const cropped = cropRegion(imageData, width, height, centerX, height - 10, 40, 10);
    
    const extracted = extractMultiLocationSignature(cropped, width, height);
    console.log('   Cropped region: bottom-center (destroys bottom-center)');
    console.log(`   Valid locations remaining: ${extracted.validLocations.join(', ')}`);
    
    if (extracted.validLocations.length >= 2 && hasElaraSignature(cropped, width, height)) {
      console.log('   ✅ Signature survives bottom-center crop');
      passed++;
    } else {
      throw new Error('Signature lost after cropping');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 9: Crop Resilience - Two Corners Cropped
  // ========================================================================
  console.log('\n📋 Test 9: Crop Resilience - Two Corners Cropped');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    const metadata = createMetadata({
      generator: 'elara.desktop',
      userFingerprint: 'test-fp',
      keyFingerprint: 'test-key',
      contentType: 'image',
      contentHash: 'abc123',
      characterId: 'elara',
      modelUsed: 'test-model',
      promptHash: 'def456',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    // Crop TWO corners (top-left AND top-right)
    let cropped = cropRegion(imageData, width, height, 0, 0, 50, 10);
    cropped = cropRegion(cropped, width, height, width - 10, 0, 10, 40);
    
    const extracted = extractMultiLocationSignature(cropped, width, height);
    console.log('   Cropped: top-left AND top-right corners');
    console.log(`   Valid locations remaining: ${extracted.validLocations.join(', ') || 'none'}`);
    
    // Should still have bottom-center
    if (extracted.validLocations.length >= 1 && hasElaraSignature(cropped, width, height)) {
      console.log('   ✅ Signature survives two-corner crop (1 location remains)');
      passed++;
    } else {
      throw new Error('Signature lost after double cropping');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 10: Full Verification Flow
  // ========================================================================
  console.log('\n📋 Test 10: Full Verification Flow');
  try {
    const width = 512;
    const height = 512;
    const imageData = createTestImageData(width, height);
    
    const userFp = await createUserFingerprint('test-user-123');
    const promptHash = await createPromptHash('A beautiful sunset over mountains');
    const contentHash = await sha256Hex(new Uint8Array(imageData));
    
    const metadata = createMetadata({
      generator: 'elara.desktop',
      userFingerprint: userFp,
      keyFingerprint: 'test-key-fp-1234',
      contentType: 'image',
      contentHash: contentHash,
      characterId: 'elara',
      modelUsed: 'black-forest-labs/FLUX.1',
      promptHash: promptHash,
    });
    
    console.log(`   Generator: ${metadata.generator}`);
    console.log(`   Version: ${metadata.signatureVersion}`);
    
    // Sign
    const signResult = await signImageContent(imageData, width, height, metadata);
    console.log(`   Locations signed: ${signResult.locationsEmbedded.join(', ')}`);
    
    // Verify
    const verifyResult = await verifyImageContent(imageData, width, height, metadata);
    console.log(`   Verified: ${verifyResult.isValid}`);
    console.log(`   Tamper detected: ${verifyResult.tamperDetected}`);
    console.log(`   Valid locations: ${verifyResult.validLocations.join(', ')}`);
    
    if (verifyResult.isValid && !verifyResult.tamperDetected && verifyResult.validLocations.length === 3) {
      console.log('   ✅ Full verification flow successful');
      passed++;
    } else {
      throw new Error('Verification failed');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 11: Read Signature API (Self-Recognition)
  // ========================================================================
  console.log('\n📋 Test 11: Self-Recognition (readSignature)');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    const metadata = createMetadata({
      generator: 'elara.cloud',
      userFingerprint: 'cloud-user',
      keyFingerprint: 'cloud-key',
      contentType: 'image',
      contentHash: 'xyz789',
      characterId: 'aeron',
      modelUsed: 'stabilityai/stable-diffusion-xl',
      promptHash: 'prompt123',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    const readResult = readSignature(imageData, width, height);
    
    console.log(`   isElara: ${readResult.isElara}`);
    console.log(`   version: ${readResult.version}`);
    console.log(`   timestamp: ${readResult.timestamp?.toISOString()}`);
    console.log(`   metaHash: ${readResult.metaHash?.slice(0, 16)}...`);
    console.log(`   validLocations: ${readResult.validLocations.join(', ')}`);
    
    if (readResult.isElara && readResult.version === 2 && readResult.validLocations.length === 3) {
      console.log('   ✅ Self-recognition works correctly');
      passed++;
    } else {
      throw new Error('Self-recognition failed');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 12: Minimum Image Size Validation
  // ========================================================================
  console.log('\n📋 Test 12: Minimum Image Size Validation');
  try {
    const tooSmall = createTestImageData(50, 30); // Below MIN_IMAGE_SIZE
    const metadata = createMetadata({
      generator: 'test',
      userFingerprint: 'x',
      keyFingerprint: 'x',
      contentType: 'image',
      contentHash: 'x',
      characterId: 'x',
      modelUsed: 'x',
      promptHash: 'x',
    });
    
    let errorThrown = false;
    try {
      await signImageContent(tooSmall, 50, 30, metadata);
    } catch (e) {
      errorThrown = true;
      console.log('   Correctly rejected 50x30 image');
      console.log(`   Error: ${(e as Error).message.slice(0, 60)}...`);
    }
    
    if (errorThrown) {
      console.log(`   ✅ Minimum size validation works (requires ${MIN_IMAGE_SIZE.width}x${MIN_IMAGE_SIZE.height})`);
      passed++;
    } else {
      throw new Error('Should have thrown error for too-small image');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 13: Unsigned Image Detection
  // ========================================================================
  console.log('\n📋 Test 13: Unsigned Image Detection');
  try {
    const width = 256;
    const height = 256;
    const unsigned = createTestImageData(width, height);
    
    const hasSig = hasElaraSignature(unsigned, width, height);
    const readResult = readSignature(unsigned, width, height);
    
    console.log(`   hasElaraSignature: ${hasSig}`);
    console.log(`   readSignature.isElara: ${readResult.isElara}`);
    
    if (!hasSig && !readResult.isElara) {
      console.log('   ✅ Correctly identifies unsigned image');
      passed++;
    } else {
      throw new Error('Falsely detected signature in unsigned image');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Test 14: hasAnyElaraSignature (v1 + v2 detection)
  // ========================================================================
  console.log('\n📋 Test 14: Version Detection (hasAnyElaraSignature)');
  try {
    const width = 256;
    const height = 256;
    const imageData = createTestImageData(width, height);
    
    // Sign with v2
    const metadata = createMetadata({
      generator: 'test',
      userFingerprint: 'x',
      keyFingerprint: 'x',
      contentType: 'image',
      contentHash: 'x',
      characterId: 'x',
      modelUsed: 'x',
      promptHash: 'x',
    });
    
    await signImageContent(imageData, width, height, metadata);
    
    const detection = hasAnyElaraSignature(imageData, width, height);
    
    console.log(`   hasSignature: ${detection.hasSignature}`);
    console.log(`   version: ${detection.version}`);
    
    if (detection.hasSignature && detection.version === '2.0') {
      console.log('   ✅ Correctly detects v2.0 signature');
      passed++;
    } else {
      throw new Error(`Expected v2.0, got ${detection.version}`);
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e}`);
    failed++;
  }

  // ========================================================================
  // Summary
  // ========================================================================
  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! ElaraSign v2.0 is ready.\n');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
