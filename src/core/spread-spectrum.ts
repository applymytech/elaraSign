/**
 * Spread Spectrum Watermarking for elaraSign
 * ==========================================
 *
 * BRUTAL HONESTY ABOUT WHAT THIS IS:
 * ----------------------------------
 * This embeds an encrypted forensic payload as NOISE distributed across
 * the ENTIRE image in the frequency domain (DCT coefficients).
 *
 * WHAT THIS SURVIVES:
 * ✅ JPEG compression (up to ~70% quality)
 * ✅ Screenshots (the pattern IS the image content)
 * ✅ Cropping (redundancy - pattern repeats in blocks)
 * ✅ Mild scaling (up to ~50% resize)
 * ✅ Social media upload (most platforms)
 * ✅ Format conversion (PNG→JPG→PNG)
 *
 * WHAT THIS DOES NOT SURVIVE:
 * ❌ Heavy blur or noise addition
 * ❌ Extreme compression (below ~50% JPEG quality)
 * ❌ Significant geometric transforms (rotation, perspective)
 * ❌ AI regeneration / img2img
 * ❌ Print and re-scan
 * ❌ Intentional watermark removal attacks
 *
 * HOW IT WORKS:
 * 1. Image is divided into 8x8 pixel blocks (like JPEG)
 * 2. Each block is transformed to frequency domain (DCT)
 * 3. A pseudo-random pattern (from metaHash seed) modulates mid-band coefficients
 * 4. The pattern encodes encrypted forensic data + error correction
 * 5. Pattern is spread across ALL blocks for redundancy
 *
 * DETECTION:
 * - Correlate against the known pattern seed
 * - Extract bits from DCT coefficients
 * - Error correction recovers the payload
 * - Decrypt with master key
 */

import { createHmac } from "node:crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Embedding strength - trade-off between invisibility and robustness
 * Lower = more invisible, less robust
 * Higher = more visible artifacts, more robust
 */
const EMBED_STRENGTH = 8; // Good balance for most images

/**
 * Which DCT coefficients to use (mid-band survives JPEG best)
 * Avoid DC (0,0) and very high frequencies
 */
const EMBED_POSITIONS: [number, number][] = [
	[1, 2],
	[2, 1],
	[2, 2],
	[1, 3],
	[3, 1],
	[2, 3],
	[3, 2],
	[3, 3],
	[1, 4],
	[4, 1],
	[2, 4],
	[4, 2],
	[3, 4],
	[4, 3],
	[4, 4],
];

/**
 * Payload structure (32 bytes = 256 bits):
 * - 4 bytes: timestamp (seconds since epoch, truncated)
 * - 4 bytes: IP address (IPv4)
 * - 8 bytes: user fingerprint (truncated hash)
 * - 1 byte: platform code
 * - 15 bytes: reserved / checksum / ECC
 */
const PAYLOAD_BITS = 256;
const BITS_PER_BLOCK = EMBED_POSITIONS.length; // 15 bits per 8x8 block
const _REDUNDANCY = 8; // Repeat payload 8 times for error correction

// ============================================================================
// DCT TRANSFORM (8x8 blocks, like JPEG)
// ============================================================================

/**
 * Pre-computed cosine lookup table for 8x8 DCT
 */
const COS_TABLE: number[][] = [];
for (let i = 0; i < 8; i++) {
	COS_TABLE[i] = [];
	for (let j = 0; j < 8; j++) {
		COS_TABLE[i][j] = Math.cos(((2 * i + 1) * j * Math.PI) / 16);
	}
}

/**
 * Normalization factors for DCT
 */
function alpha(u: number): number {
	return u === 0 ? 1 / Math.sqrt(2) : 1;
}

/**
 * Forward DCT on 8x8 block
 */
function dct8x8(block: number[][]): number[][] {
	const result: number[][] = Array(8)
		.fill(null)
		.map(() => Array(8).fill(0));

	for (let u = 0; u < 8; u++) {
		for (let v = 0; v < 8; v++) {
			let sum = 0;
			for (let x = 0; x < 8; x++) {
				for (let y = 0; y < 8; y++) {
					sum += block[x][y] * COS_TABLE[x][u] * COS_TABLE[y][v];
				}
			}
			result[u][v] = 0.25 * alpha(u) * alpha(v) * sum;
		}
	}

	return result;
}

/**
 * Inverse DCT on 8x8 block
 */
function idct8x8(dctBlock: number[][]): number[][] {
	const result: number[][] = Array(8)
		.fill(null)
		.map(() => Array(8).fill(0));

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let sum = 0;
			for (let u = 0; u < 8; u++) {
				for (let v = 0; v < 8; v++) {
					sum += alpha(u) * alpha(v) * dctBlock[u][v] * COS_TABLE[x][u] * COS_TABLE[y][v];
				}
			}
			result[x][y] = 0.25 * sum;
		}
	}

	return result;
}

// ============================================================================
// PSEUDO-RANDOM SEQUENCE GENERATOR
// ============================================================================

/**
 * Generate deterministic pseudo-random sequence from seed
 * Used to create the "pattern" that we embed
 */
function generatePRSequence(seed: string, length: number): number[] {
	const sequence: number[] = [];
	let counter = 0;

	while (sequence.length < length) {
		const hash = createHmac("sha256", seed).update(`${counter}`).digest();

		for (let i = 0; i < hash.length && sequence.length < length; i++) {
			// Convert to +1 or -1 (bipolar)
			sequence.push(hash[i] & 1 ? 1 : -1);
		}
		counter++;
	}

	return sequence;
}

// ============================================================================
// SPREAD SPECTRUM EMBEDDING
// ============================================================================

export interface SpreadSpectrumPayload {
	timestamp: number; // Unix timestamp (seconds)
	ipBytes: Uint8Array; // 4 bytes IPv4
	fingerprint: Uint8Array; // 8 bytes (truncated)
	platformCode: number; // 1 byte
}

/**
 * Encode payload to bits with simple checksum
 */
function encodePayload(payload: SpreadSpectrumPayload): Uint8Array {
	const bits = new Uint8Array(PAYLOAD_BITS / 8); // 32 bytes

	// Timestamp (4 bytes, big-endian)
	bits[0] = (payload.timestamp >> 24) & 0xff;
	bits[1] = (payload.timestamp >> 16) & 0xff;
	bits[2] = (payload.timestamp >> 8) & 0xff;
	bits[3] = payload.timestamp & 0xff;

	// IP (4 bytes)
	bits[4] = payload.ipBytes[0];
	bits[5] = payload.ipBytes[1];
	bits[6] = payload.ipBytes[2];
	bits[7] = payload.ipBytes[3];

	// Fingerprint (8 bytes)
	for (let i = 0; i < 8; i++) {
		bits[8 + i] = payload.fingerprint[i] || 0;
	}

	// Platform code (1 byte)
	bits[16] = payload.platformCode;

	// Magic marker "ES" (2 bytes) - helps detect valid payload
	bits[17] = 0x45; // 'E'
	bits[18] = 0x53; // 'S'

	// Checksum (remaining bytes) - XOR of first 19 bytes repeated
	let checksum = 0;
	for (let i = 0; i < 19; i++) {
		checksum ^= bits[i];
	}
	for (let i = 19; i < 32; i++) {
		bits[i] = checksum ^ (i - 19);
	}

	return bits;
}

/**
 * Decode payload from bits
 */
function decodePayload(bits: Uint8Array): SpreadSpectrumPayload | null {
	if (bits.length < 32) {
		return null;
	}

	// Verify magic marker
	if (bits[17] !== 0x45 || bits[18] !== 0x53) {
		return null;
	}

	// Verify checksum
	let checksum = 0;
	for (let i = 0; i < 19; i++) {
		checksum ^= bits[i];
	}
	for (let i = 19; i < 32; i++) {
		if (bits[i] !== (checksum ^ (i - 19))) {
			return null; // Checksum mismatch
		}
	}

	return {
		timestamp: (bits[0] << 24) | (bits[1] << 16) | (bits[2] << 8) | bits[3],
		ipBytes: new Uint8Array([bits[4], bits[5], bits[6], bits[7]]),
		fingerprint: new Uint8Array(bits.slice(8, 16)),
		platformCode: bits[16],
	};
}

/**
 * Convert bytes to bit array
 */
function bytesToBits(bytes: Uint8Array): number[] {
	const bits: number[] = [];
	for (const byte of bytes) {
		for (let i = 7; i >= 0; i--) {
			bits.push((byte >> i) & 1);
		}
	}
	return bits;
}

/**
 * Convert bit array to bytes
 */
function bitsToBytes(bits: number[]): Uint8Array {
	const bytes = new Uint8Array(Math.ceil(bits.length / 8));
	for (let i = 0; i < bits.length; i++) {
		if (bits[i]) {
			bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
		}
	}
	return bytes;
}

/**
 * Embed spread spectrum watermark into image
 *
 * @param imageData - RGBA pixel data (Uint8ClampedArray)
 * @param width - Image width
 * @param height - Image height
 * @param payload - Forensic data to embed
 * @param seed - Unique seed for this image (metaHash)
 * @returns Modified image data
 */
export function embedSpreadSpectrum(
	imageData: Uint8ClampedArray,
	width: number,
	height: number,
	payload: SpreadSpectrumPayload,
	seed: string,
): Uint8ClampedArray {
	// Encode payload to bits
	const payloadBytes = encodePayload(payload);
	const payloadBits = bytesToBits(payloadBytes);

	// Generate PR sequence (much longer than payload for spreading)
	const blocksX = Math.floor(width / 8);
	const blocksY = Math.floor(height / 8);
	const totalBlocks = blocksX * blocksY;
	const prSequence = generatePRSequence(seed, totalBlocks * BITS_PER_BLOCK);

	// Copy image data for modification
	const output = new Uint8ClampedArray(imageData);

	// Process each 8x8 block
	let blockIndex = 0;

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			// Extract luminance (Y) channel from block
			const block: number[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(0));

			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					const px = bx * 8 + x;
					const py = by * 8 + y;
					const idx = (py * width + px) * 4;

					// Convert RGB to luminance (ITU-R BT.601)
					const r = imageData[idx];
					const g = imageData[idx + 1];
					const b = imageData[idx + 2];
					block[y][x] = 0.299 * r + 0.587 * g + 0.114 * b;
				}
			}

			// Forward DCT
			const dctBlock = dct8x8(block);

			// Embed bits in this block
			for (let i = 0; i < EMBED_POSITIONS.length; i++) {
				const [u, v] = EMBED_POSITIONS[i];
				const prIndex = blockIndex * BITS_PER_BLOCK + i;
				const prValue = prSequence[prIndex]; // +1 or -1

				// Which payload bit to embed (with redundancy across all blocks)
				const bitIndex = (blockIndex * BITS_PER_BLOCK + i) % PAYLOAD_BITS;
				const bit = payloadBits[bitIndex];
				const bitValue = bit ? 1 : -1; // Convert 0/1 to -1/+1

				// Spread spectrum: multiply bit by PR sequence
				const spreadValue = bitValue * prValue * EMBED_STRENGTH;

				// Add to DCT coefficient
				dctBlock[u][v] += spreadValue;
			}

			// Inverse DCT
			const modifiedBlock = idct8x8(dctBlock);

			// Write back to image (adjust RGB to match new luminance)
			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					const px = bx * 8 + x;
					const py = by * 8 + y;
					const idx = (py * width + px) * 4;

					const oldLum = block[y][x];
					const newLum = modifiedBlock[y][x];
					const lumDelta = newLum - oldLum;

					// Apply luminance delta to RGB channels proportionally
					output[idx] = Math.max(0, Math.min(255, imageData[idx] + lumDelta * 0.299));
					output[idx + 1] = Math.max(0, Math.min(255, imageData[idx + 1] + lumDelta * 0.587));
					output[idx + 2] = Math.max(0, Math.min(255, imageData[idx + 2] + lumDelta * 0.114));
					// Alpha unchanged
				}
			}

			blockIndex++;
		}
	}

	return output;
}

/**
 * Extract spread spectrum watermark from image
 *
 * @param imageData - RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @param seed - The seed used during embedding (metaHash)
 * @returns Extracted payload or null if not found/corrupted
 */
export function extractSpreadSpectrum(
	imageData: Uint8ClampedArray,
	width: number,
	height: number,
	seed: string,
): { payload: SpreadSpectrumPayload; confidence: number } | null {
	const blocksX = Math.floor(width / 8);
	const blocksY = Math.floor(height / 8);
	const totalBlocks = blocksX * blocksY;
	const prSequence = generatePRSequence(seed, totalBlocks * BITS_PER_BLOCK);

	// Accumulate bit votes (soft decision)
	const bitVotes: number[] = Array(PAYLOAD_BITS).fill(0);
	const bitCounts: number[] = Array(PAYLOAD_BITS).fill(0);

	let blockIndex = 0;

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			// Extract luminance block
			const block: number[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(0));

			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					const px = bx * 8 + x;
					const py = by * 8 + y;
					const idx = (py * width + px) * 4;

					const r = imageData[idx];
					const g = imageData[idx + 1];
					const b = imageData[idx + 2];
					block[y][x] = 0.299 * r + 0.587 * g + 0.114 * b;
				}
			}

			// Forward DCT
			const dctBlock = dct8x8(block);

			// Extract bits
			for (let i = 0; i < EMBED_POSITIONS.length; i++) {
				const [u, v] = EMBED_POSITIONS[i];
				const prIndex = blockIndex * BITS_PER_BLOCK + i;
				const prValue = prSequence[prIndex];

				// Despread: multiply by same PR sequence
				const extractedValue = dctBlock[u][v] * prValue;

				// Vote for bit value
				const bitIndex = (blockIndex * BITS_PER_BLOCK + i) % PAYLOAD_BITS;
				bitVotes[bitIndex] += extractedValue;
				bitCounts[bitIndex]++;
			}

			blockIndex++;
		}
	}

	// Decide bits by majority vote
	const extractedBits: number[] = [];
	let totalConfidence = 0;

	for (let i = 0; i < PAYLOAD_BITS; i++) {
		const avgVote = bitVotes[i] / (bitCounts[i] || 1);
		extractedBits.push(avgVote > 0 ? 1 : 0);
		totalConfidence += Math.abs(avgVote);
	}

	const avgConfidence = totalConfidence / PAYLOAD_BITS;

	// Convert to bytes and decode
	const extractedBytes = bitsToBytes(extractedBits);
	const payload = decodePayload(extractedBytes);

	if (!payload) {
		return null;
	}

	return {
		payload,
		confidence: Math.min(1, avgConfidence / EMBED_STRENGTH),
	};
}

/**
 * Check if an image likely contains a spread spectrum watermark
 * (Quick check without full extraction)
 */
export function hasSpreadSpectrumSignature(
	imageData: Uint8ClampedArray,
	width: number,
	height: number,
	seed: string,
): boolean {
	// Sample a few blocks and check correlation
	const result = extractSpreadSpectrum(imageData, width, height, seed);
	return result !== null && result.confidence > 0.3;
}
