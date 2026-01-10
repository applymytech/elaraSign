/**
 * ElaraSign Standard v2.0
 * ========================
 * Platform-agnostic content signing module with multi-location redundancy.
 * Works in both Node.js (Desktop) and Browser (Cloud).
 * 
 * v2.0 IMPROVEMENTS:
 * - 3 signature locations for crop resilience (top-left, top-right, bottom-center)
 * - Compact signature (48 bytes) fits in smaller blocks
 * - Any single location can verify authenticity
 * - Survives common social media cropping
 * 
 * DO NOT import platform-specific APIs (fs, canvas, etc.)
 * All functions work with raw Uint8ClampedArray pixel data.
 * 
 * @author OpenElara Project
 * @license MIT
 * @version 2.0.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Signature marker identifying Elara-signed content (v2) */
export const ELARA_MARKER = 'ELARA2';  // 6 bytes (shorter for compact sig)

/** Current signing standard version */
export const ELARA_VERSION = 0x02;

/**
 * MULTI-LOCATION SIGNATURE BLOCKS
 * ================================
 * Three locations for redundancy. Troll must crop ALL THREE to remove signature.
 * 
 * Layout visualization (not to scale):
 * 
 *   ┌──────┐─────────────────────────────┌──────┐
 *   │ LOC1 │                             │ LOC2 │
 *   │32x4  │                             │ 4x32 │
 *   └──────┘                             │      │
 *   │                                    │      │
 *   │              IMAGE                 └──────┘
 *   │                                           
 *   │                                           
 *   ├────────────────┌──────┐───────────────────┤
 *   │                │ LOC3 │                   │
 *   └────────────────│32x4  │───────────────────┘
 *                    └──────┘
 */
export const SIGNATURE_LOCATIONS = {
  /** Top-left horizontal block */
  topLeft: {
    name: 'top-left',
    width: 32,
    height: 4,
    getPosition: (imgWidth: number, _imgHeight: number) => ({ x: 0, y: 0 }),
  },
  /** Top-right vertical block */
  topRight: {
    name: 'top-right', 
    width: 4,
    height: 32,
    getPosition: (imgWidth: number, _imgHeight: number) => ({ x: imgWidth - 4, y: 0 }),
  },
  /** Bottom-center horizontal block */
  bottomCenter: {
    name: 'bottom-center',
    width: 32,
    height: 4,
    getPosition: (imgWidth: number, imgHeight: number) => ({ 
      x: Math.floor((imgWidth - 32) / 2), 
      y: imgHeight - 4 
    }),
  },
} as const;

/** Minimum image size to support all signature locations */
export const MIN_IMAGE_SIZE = {
  width: 64,   // Need space for bottom-center (32px) + margins
  height: 36,  // Need space for top-right (32px) + bottom (4px)
} as const;

/** 
 * Compact signature layout (48 bytes total)
 * Fits in 32x4 = 128 pixels, using 4 bits per pixel = 64 bytes capacity
 */
export const SIGNATURE_LAYOUT = {
  marker: 6,      // "ELARA2"
  version: 1,     // 0x02
  locationId: 1,  // Which location this is (0, 1, 2)
  metaHash: 16,   // First 16 bytes of SHA-256
  contentHash: 16,// First 16 bytes of SHA-256  
  timestamp: 4,   // Unix timestamp (seconds, 4 bytes)
  checksum: 4,    // CRC-32 for better integrity
  total: 48,      // bytes total
} as const;

/** Capacity of each signature block (nibble-based: 4 bits per pixel) */
export const BLOCK_CAPACITY = 64; // 32*4 pixels * 4 bits / 8 = 64 bytes

// ============================================================================
// TYPES
// ============================================================================

/**
 * Elara Content Metadata Schema v2.0
 * CANONICAL - Both Desktop and Cloud use this exact schema
 */
export interface ElaraContentMetadata {
  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIRED FIELDS (must be present for valid signature)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Elara signing standard version */
  signatureVersion: '2.0';
  
  /** Generator app identifier */
  generator: 'elara.desktop' | 'elara.cloud' | string;
  
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
  
  /** SHA-256 hash of userId (NOT raw ID for privacy) */
  userFingerprint: string;
  
  /** Public key fingerprint for verification */
  keyFingerprint: string;
  
  /** Type of content being signed */
  contentType: 'image' | 'video' | 'audio' | 'document';
  
  /** SHA-256 of raw content bytes (full hash stored in metadata) */
  contentHash: string;
  
  /** AI character that generated this content */
  characterId: string;
  
  /** Model used for generation */
  modelUsed: string;
  
  /** SHA-256 of prompt (NOT raw prompt for privacy) */
  promptHash: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL FIELDS (enhance but don't affect signature validity)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Image/video width in pixels */
  width?: number;
  
  /** Image/video height in pixels */
  height?: number;
  
  /** Generation seed (if deterministic) */
  seed?: number;
  
  /** Number of inference steps */
  steps?: number;
  
  /** Guidance scale / CFG */
  guidanceScale?: number;
  
  /** How generation was triggered */
  generationType?: 'selfie' | 'custom' | 'agentic';
  
  /** User's original request (summary) */
  userRequest?: string;
  
  /** AI's interpretation of request */
  aiDecision?: string;
  
  /** Full prompt text (only if user consents) */
  fullPrompt?: string;
  
  /** Negative prompt used */
  negativePrompt?: string;
  
  /** Creator info for human-created content (name/email combined) */
  creatorInfo?: string;
}

/** Location identifiers for multi-location signing */
export type SignatureLocationId = 0 | 1 | 2;
export const LOCATION_IDS = {
  topLeft: 0 as SignatureLocationId,
  topRight: 1 as SignatureLocationId,
  bottomCenter: 2 as SignatureLocationId,
} as const;

/**
 * Result of signature verification
 */
export interface VerificationResult {
  /** Whether any valid signature was found */
  isValid: boolean;
  
  /** Whether content was signed but tampered with */
  tamperDetected: boolean;
  
  /** Which locations had valid signatures */
  validLocations: string[];
  
  /** Which locations had corrupted/missing signatures */
  invalidLocations: string[];
  
  /** Error message if verification failed */
  error?: string;
  
  /** Marker found in signature */
  marker?: string;
  
  /** Version byte found */
  version?: number;
  
  /** Metadata hash from signature (hex) */
  metaHashHex?: string;
  
  /** Content hash from signature (hex) */
  contentHashHex?: string;
  
  /** Timestamp from signature */
  timestamp?: Date;
}

/**
 * Packed signature data ready for embedding
 */
export interface PackedSignature {
  /** Raw bytes to embed (48 bytes) */
  data: Uint8Array;
  
  /** Location ID this signature is for */
  locationId: SignatureLocationId;
  
  /** Metadata hash (hex, first 16 bytes) */
  metaHash: string;
  
  /** Content hash (hex, first 16 bytes) */
  contentHash: string;
  
  /** Timestamp embedded */
  timestamp: number;
}

// ============================================================================
// CRC-32 (IEEE 802.3)
// ============================================================================

/** CRC-32 lookup table */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * Calculate CRC-32 checksum
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============================================================================
// HASHING UTILITIES
// ============================================================================

/**
 * SHA-256 hash as hex string
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' 
    ? new TextEncoder().encode(data) 
    : new Uint8Array(data);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);
  
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 hash as Uint8Array (first N bytes)
 */
export async function sha256Bytes(data: string | Uint8Array, bytes = 32): Promise<Uint8Array> {
  const input = typeof data === 'string' 
    ? new TextEncoder().encode(data) 
    : new Uint8Array(data);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(hashBuffer).slice(0, bytes);
}

// ============================================================================
// SIGNATURE PACKING (Compact v2.0 format)
// ============================================================================

/**
 * Pack signature for a specific location
 * 
 * Layout (48 bytes):
 * [MARKER: 6][VERSION: 1][LOCATION: 1][META_HASH: 16][CONTENT_HASH: 16][TIMESTAMP: 4][CRC32: 4]
 */
export async function packSignatureForLocation(
  metadataJson: string,
  contentBytes: Uint8Array,
  locationId: SignatureLocationId
): Promise<PackedSignature> {
  // Calculate hashes (truncated to 16 bytes for compact storage)
  const metaHash = await sha256Bytes(metadataJson, 16);
  const contentHash = await sha256Bytes(contentBytes, 16);
  const timestamp = Math.floor(Date.now() / 1000); // Unix seconds
  
  // Create buffer for signature (48 bytes)
  const signature = new Uint8Array(SIGNATURE_LAYOUT.total);
  let offset = 0;
  
  // 1. Marker (6 bytes): "ELARA2"
  const markerBytes = new TextEncoder().encode(ELARA_MARKER);
  signature.set(markerBytes, offset);
  offset += SIGNATURE_LAYOUT.marker;
  
  // 2. Version (1 byte): 0x02
  signature[offset] = ELARA_VERSION;
  offset += SIGNATURE_LAYOUT.version;
  
  // 3. Location ID (1 byte): 0, 1, or 2
  signature[offset] = locationId;
  offset += SIGNATURE_LAYOUT.locationId;
  
  // 4. Metadata hash (16 bytes)
  signature.set(metaHash, offset);
  offset += SIGNATURE_LAYOUT.metaHash;
  
  // 5. Content hash (16 bytes)
  signature.set(contentHash, offset);
  offset += SIGNATURE_LAYOUT.contentHash;
  
  // 6. Timestamp (4 bytes, big-endian)
  signature[offset] = (timestamp >> 24) & 0xFF;
  signature[offset + 1] = (timestamp >> 16) & 0xFF;
  signature[offset + 2] = (timestamp >> 8) & 0xFF;
  signature[offset + 3] = timestamp & 0xFF;
  offset += SIGNATURE_LAYOUT.timestamp;
  
  // 7. CRC-32 checksum (4 bytes) - of everything above
  const dataToChecksum = signature.slice(0, offset);
  const checksum = crc32(dataToChecksum);
  signature[offset] = (checksum >>> 24) & 0xFF;
  signature[offset + 1] = (checksum >>> 16) & 0xFF;
  signature[offset + 2] = (checksum >>> 8) & 0xFF;
  signature[offset + 3] = checksum & 0xFF;
  
  return {
    data: signature,
    locationId,
    metaHash: arrayToHex(metaHash),
    contentHash: arrayToHex(contentHash),
    timestamp,
  };
}

/**
 * Unpack and validate a signature byte array
 */
export function unpackSignature(signature: Uint8Array): {
  marker: string;
  version: number;
  locationId: number;
  metaHash: Uint8Array;
  contentHash: Uint8Array;
  timestamp: number;
  checksum: number;
  computedChecksum: number;
  isValid: boolean;
} | null {
  if (signature.length < SIGNATURE_LAYOUT.total) {
    return null;
  }
  
  let offset = 0;
  
  // 1. Extract marker
  const markerBytes = signature.slice(offset, offset + SIGNATURE_LAYOUT.marker);
  const marker = new TextDecoder().decode(markerBytes);
  offset += SIGNATURE_LAYOUT.marker;
  
  // Quick check - if marker doesn't match, not an Elara signature
  if (marker !== ELARA_MARKER) {
    return null;
  }
  
  // 2. Extract version
  const version = signature[offset];
  offset += SIGNATURE_LAYOUT.version;
  
  // 3. Extract location ID
  const locationId = signature[offset];
  offset += SIGNATURE_LAYOUT.locationId;
  
  // 4. Extract metadata hash
  const metaHash = signature.slice(offset, offset + SIGNATURE_LAYOUT.metaHash);
  offset += SIGNATURE_LAYOUT.metaHash;
  
  // 5. Extract content hash
  const contentHash = signature.slice(offset, offset + SIGNATURE_LAYOUT.contentHash);
  offset += SIGNATURE_LAYOUT.contentHash;
  
  // 6. Extract timestamp (use >>> 0 to ensure unsigned 32-bit)
  const timestamp = ((signature[offset] << 24) | 
                    (signature[offset + 1] << 16) | 
                    (signature[offset + 2] << 8) | 
                    signature[offset + 3]) >>> 0;
  offset += SIGNATURE_LAYOUT.timestamp;
  
  // 7. Extract and verify checksum (use >>> 0 to ensure unsigned)
  const checksum = ((signature[offset] << 24) | 
                   (signature[offset + 1] << 16) | 
                   (signature[offset + 2] << 8) | 
                   signature[offset + 3]) >>> 0;
  
  const dataToChecksum = signature.slice(0, offset);
  const computedChecksum = crc32(dataToChecksum);
  
  return {
    marker,
    version,
    locationId,
    metaHash,
    contentHash,
    timestamp,
    checksum,
    computedChecksum,
    isValid: checksum === computedChecksum,
  };
}

// ============================================================================
// STEGANOGRAPHY: MULTI-LOCATION EMBEDDING
// ============================================================================

/**
 * Embed signature at a specific location in image
 * Uses LSB (4 bits per pixel) in blue channel
 */
function embedAtLocation(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  signature: Uint8Array,
  location: typeof SIGNATURE_LOCATIONS[keyof typeof SIGNATURE_LOCATIONS]
): void {
  const pos = location.getPosition(width, height);
  const blockWidth = location.width;
  const blockHeight = location.height;
  
  // Pad signature to full capacity
  const paddedSignature = new Uint8Array(BLOCK_CAPACITY);
  paddedSignature.set(signature);
  
  let byteIndex = 0;
  let nibbleIndex = 0; // 0 = high nibble, 1 = low nibble
  
  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      if (byteIndex >= paddedSignature.length) break;
      
      const x = pos.x + dx;
      const y = pos.y + dy;
      
      // Skip if out of bounds
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const pixelIndex = (y * width + x) * 4;
      const blueChannelIndex = pixelIndex + 2;
      
      // Get current blue value
      const blueValue = imageData[blueChannelIndex];
      
      // Get nibble to embed
      const byte = paddedSignature[byteIndex];
      const nibble = nibbleIndex === 0 
        ? (byte >> 4) & 0x0F  // High nibble
        : byte & 0x0F;        // Low nibble
      
      // Embed nibble in blue channel's lower 4 bits
      const newBlueValue = (blueValue & 0xF0) | nibble;
      imageData[blueChannelIndex] = newBlueValue;
      
      // Move to next nibble/byte
      nibbleIndex++;
      if (nibbleIndex === 2) {
        nibbleIndex = 0;
        byteIndex++;
      }
    }
  }
}

/**
 * Extract signature from a specific location in image
 */
function extractFromLocation(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  location: typeof SIGNATURE_LOCATIONS[keyof typeof SIGNATURE_LOCATIONS]
): Uint8Array | null {
  const pos = location.getPosition(width, height);
  const blockWidth = location.width;
  const blockHeight = location.height;
  
  // Check if location is within image bounds
  if (pos.x < 0 || pos.x + blockWidth > width || 
      pos.y < 0 || pos.y + blockHeight > height) {
    return null;
  }
  
  const result: number[] = [];
  let currentByte = 0;
  let nibbleIndex = 0;
  
  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      if (result.length >= BLOCK_CAPACITY) break;
      
      const x = pos.x + dx;
      const y = pos.y + dy;
      
      const pixelIndex = (y * width + x) * 4;
      const blueChannelIndex = pixelIndex + 2;
      
      // Extract lower 4 bits from blue channel
      const nibble = imageData[blueChannelIndex] & 0x0F;
      
      if (nibbleIndex === 0) {
        // High nibble
        currentByte = nibble << 4;
        nibbleIndex = 1;
      } else {
        // Low nibble - complete the byte
        currentByte |= nibble;
        result.push(currentByte);
        currentByte = 0;
        nibbleIndex = 0;
      }
    }
  }
  
  const signature = new Uint8Array(result);
  
  // Quick validation: check for marker
  const marker = new TextDecoder().decode(signature.slice(0, 6));
  if (marker !== ELARA_MARKER) {
    return null;
  }
  
  return signature;
}

/**
 * Embed Elara signatures at ALL THREE locations for redundancy
 */
export async function embedMultiLocationSignature(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  metadataJson: string,
  contentBytes: Uint8Array
): Promise<{
  signedImageData: Uint8ClampedArray;
  metaHash: string;
  contentHash: string;
  locationsEmbedded: string[];
}> {
  // Validate image size
  if (width < MIN_IMAGE_SIZE.width || height < MIN_IMAGE_SIZE.height) {
    throw new Error(
      `Image too small for multi-location signing. Minimum: ${MIN_IMAGE_SIZE.width}x${MIN_IMAGE_SIZE.height}px`
    );
  }
  
  const locationsEmbedded: string[] = [];
  let metaHash = '';
  let contentHash = '';
  
  // Embed at each location
  const locations = [
    { loc: SIGNATURE_LOCATIONS.topLeft, id: LOCATION_IDS.topLeft },
    { loc: SIGNATURE_LOCATIONS.topRight, id: LOCATION_IDS.topRight },
    { loc: SIGNATURE_LOCATIONS.bottomCenter, id: LOCATION_IDS.bottomCenter },
  ];
  
  for (const { loc, id } of locations) {
    try {
      const packed = await packSignatureForLocation(metadataJson, contentBytes, id);
      embedAtLocation(imageData, width, height, packed.data, loc);
      locationsEmbedded.push(loc.name);
      metaHash = packed.metaHash;
      contentHash = packed.contentHash;
    } catch (e) {
      // Location couldn't be embedded (edge case for very narrow/short images)
      console.warn(`Could not embed at ${loc.name}:`, e);
    }
  }
  
  if (locationsEmbedded.length === 0) {
    throw new Error('Could not embed signature at any location');
  }
  
  return {
    signedImageData: imageData,
    metaHash,
    contentHash,
    locationsEmbedded,
  };
}

/**
 * Extract and verify signatures from ALL locations
 * Returns valid if ANY location has valid signature (redundancy)
 */
export function extractMultiLocationSignature(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): {
  signatures: Array<ReturnType<typeof unpackSignature>>;
  validLocations: string[];
  invalidLocations: string[];
  bestSignature: ReturnType<typeof unpackSignature> | null;
} {
  const signatures: Array<ReturnType<typeof unpackSignature>> = [];
  const validLocations: string[] = [];
  const invalidLocations: string[] = [];
  
  const locations = [
    { loc: SIGNATURE_LOCATIONS.topLeft, name: 'top-left' },
    { loc: SIGNATURE_LOCATIONS.topRight, name: 'top-right' },
    { loc: SIGNATURE_LOCATIONS.bottomCenter, name: 'bottom-center' },
  ];
  
  for (const { loc, name } of locations) {
    const rawSig = extractFromLocation(imageData, width, height, loc);
    if (rawSig) {
      const unpacked = unpackSignature(rawSig);
      if (unpacked?.isValid) {
        signatures.push(unpacked);
        validLocations.push(name);
      } else {
        invalidLocations.push(name);
      }
    } else {
      invalidLocations.push(name);
    }
  }
  
  // Return the best (most recent) valid signature
  const bestSignature = signatures.length > 0 
    ? signatures.reduce((best, curr) => 
        (curr?.timestamp ?? 0) > (best?.timestamp ?? 0) ? curr : best
      )
    : null;
  
  return {
    signatures,
    validLocations,
    invalidLocations,
    bestSignature,
  };
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Sign image content with ElaraSign v2.0 (multi-location).
 * 
 * @param imageData - RGBA pixel data (mutable)
 * @param width - Image width
 * @param height - Image height
 * @param metadata - Elara content metadata
 * @returns Signed image data and signature info
 */
export async function signImageContent(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  metadata: ElaraContentMetadata
): Promise<{
  signedImageData: Uint8ClampedArray;
  metaHash: string;
  contentHash: string;
  locationsEmbedded: string[];
}> {
  // Serialize metadata to JSON
  const metadataJson = JSON.stringify(metadata);
  
  // Create content bytes for hashing (before signing)
  const contentBytes = new Uint8Array(imageData);
  
  // Embed at all locations
  return embedMultiLocationSignature(imageData, width, height, metadataJson, contentBytes);
}

/**
 * Verify image content signature (checks all locations).
 * Returns valid if ANY location has matching signature.
 */
export async function verifyImageContent(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  metadata?: ElaraContentMetadata
): Promise<VerificationResult> {
  // Extract from all locations
  const extracted = extractMultiLocationSignature(imageData, width, height);
  
  if (extracted.validLocations.length === 0) {
    return {
      isValid: false,
      tamperDetected: false,
      validLocations: [],
      invalidLocations: extracted.invalidLocations,
      error: 'No valid Elara signature found in image',
    };
  }
  
  // We know bestSignature exists because validLocations.length > 0
  const best = extracted.bestSignature;
  if (!best) {
    // This should never happen given the check above, but satisfies TypeScript
    return {
      isValid: false,
      tamperDetected: false,
      validLocations: [],
      invalidLocations: extracted.invalidLocations,
      error: 'Internal error: bestSignature undefined',
    };
  }
  
  // If metadata provided, verify hashes match
  if (metadata) {
    const metadataJson = JSON.stringify(metadata);
    const expectedMetaHash = await sha256Bytes(metadataJson, 16);
    
    if (!arraysEqual(best.metaHash, expectedMetaHash)) {
      return {
        isValid: false,
        tamperDetected: true,
        validLocations: extracted.validLocations,
        invalidLocations: extracted.invalidLocations,
        error: 'Metadata hash mismatch - metadata may have been modified',
        marker: best.marker,
        version: best.version,
        metaHashHex: arrayToHex(best.metaHash),
      };
    }
  }
  
  return {
    isValid: true,
    tamperDetected: false,
    validLocations: extracted.validLocations,
    invalidLocations: extracted.invalidLocations,
    marker: best.marker,
    version: best.version,
    metaHashHex: arrayToHex(best.metaHash),
    contentHashHex: arrayToHex(best.contentHash),
    timestamp: new Date(best.timestamp * 1000),
  };
}

/**
 * Quick check if image has ANY Elara signature (without full verification)
 */
export function hasElaraSignature(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  const extracted = extractMultiLocationSignature(imageData, width, height);
  return extracted.validLocations.length > 0;
}

/**
 * Read signature without verification (for self-recognition)
 */
export function readSignature(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): {
  isElara: boolean;
  version?: number;
  timestamp?: Date;
  metaHash?: string;
  contentHash?: string;
  validLocations: string[];
} {
  const extracted = extractMultiLocationSignature(imageData, width, height);
  
  if (extracted.validLocations.length === 0 || !extracted.bestSignature) {
    return { isElara: false, validLocations: [] };
  }
  
  const best = extracted.bestSignature;
  return {
    isElara: true,
    version: best.version,
    timestamp: new Date(best.timestamp * 1000),
    metaHash: arrayToHex(best.metaHash),
    contentHash: arrayToHex(best.contentHash),
    validLocations: extracted.validLocations,
  };
}

// ============================================================================
// METADATA UTILITIES
// ============================================================================

/**
 * Create a minimal valid metadata object (v2.0)
 */
export function createMetadata(params: {
  generator: 'elara.desktop' | 'elara.cloud' | string;
  userFingerprint: string;
  keyFingerprint: string;
  contentType: 'image' | 'video' | 'audio' | 'document';
  contentHash: string;
  characterId: string;
  modelUsed: string;
  promptHash: string;
}): ElaraContentMetadata {
  return {
    signatureVersion: '2.0',
    generator: params.generator,
    generatedAt: new Date().toISOString(),
    userFingerprint: params.userFingerprint,
    keyFingerprint: params.keyFingerprint,
    contentType: params.contentType,
    contentHash: params.contentHash,
    characterId: params.characterId,
    modelUsed: params.modelUsed,
    promptHash: params.promptHash,
  };
}

/**
 * Hash user ID for privacy-preserving fingerprint
 */
export async function createUserFingerprint(userId: string): Promise<string> {
  return sha256Hex(`elara:user:${userId}`);
}

/**
 * Hash prompt for privacy-preserving storage
 */
export async function createPromptHash(prompt: string): Promise<string> {
  return sha256Hex(`elara:prompt:${prompt}`);
}

/**
 * Create key fingerprint from public key bytes
 */
export async function createKeyFingerprint(publicKeyBytes: Uint8Array): Promise<string> {
  const hash = await sha256Hex(publicKeyBytes);
  return hash.slice(0, 16);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function arrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToArray(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

// ============================================================================
// BACKWARDS COMPATIBILITY (v1.0 reading)
// ============================================================================

/** v1.0 marker for backwards compatibility */
const ELARA_V1_MARKER = 'ELARA_V1';

/**
 * Check for v1.0 signature (bottom-left 64x4 block)
 * Allows reading old signatures while writing new v2.0 format
 */
export function extractV1Signature(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array | null {
  if (width < 64 || height < 4) return null;
  
  const startY = height - 4;
  const startX = 0;
  
  const result: number[] = [];
  let currentByte = 0;
  let nibbleIndex = 0;
  
  for (let y = startY; y < startY + 4; y++) {
    for (let x = startX; x < startX + 64; x++) {
      if (result.length >= 128) break;
      
      const pixelIndex = (y * width + x) * 4;
      const blueChannelIndex = pixelIndex + 2;
      const nibble = imageData[blueChannelIndex] & 0x0F;
      
      if (nibbleIndex === 0) {
        currentByte = nibble << 4;
        nibbleIndex = 1;
      } else {
        currentByte |= nibble;
        result.push(currentByte);
        currentByte = 0;
        nibbleIndex = 0;
      }
    }
  }
  
  const signature = new Uint8Array(result);
  const marker = new TextDecoder().decode(signature.slice(0, 8));
  
  if (marker === ELARA_V1_MARKER) {
    return signature;
  }
  
  return null;
}

/**
 * Check if image has either v1.0 or v2.0 signature
 */
export function hasAnyElaraSignature(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): { hasSignature: boolean; version: '1.0' | '2.0' | null } {
  // Check v2.0 first (preferred)
  const v2 = extractMultiLocationSignature(imageData, width, height);
  if (v2.validLocations.length > 0) {
    return { hasSignature: true, version: '2.0' };
  }
  
  // Fall back to v1.0
  const v1 = extractV1Signature(imageData, width, height);
  if (v1) {
    return { hasSignature: true, version: '1.0' };
  }
  
  return { hasSignature: false, version: null };
}
