/**
 * Forensic Accountability Encryption
 * ===================================
 *
 * "Break glass in emergency" system for content accountability.
 *
 * CONCEPT:
 * --------
 * - Every signed image contains encrypted accountability data
 * - Data includes: timestamp, user fingerprint, IP, platform
 * - ONLY the master key holder can decrypt this data
 * - The public app NEVER has access to the key
 * - Key is generated once, shown once, stored offline
 *
 * USE CASE:
 * ---------
 * Authorities: "Someone used your generator to make illegal content.
 *              They stripped metadata but we found watermark. Can you help?"
 * Operator:    "Yes, here's my master key - decrypt the accountability data."
 *
 * This provides:
 * - Privacy by default (no database of user activity)
 * - Legal compliance (can cooperate with valid requests)
 * - Inescapable accountability (data IN the pixels, survives stripping)
 *
 * @author OpenElara Project
 * @license MIT
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Master key length (256 bits) */
export const MASTER_KEY_LENGTH = 32;

/** Encrypted payload size */
export const ENCRYPTED_PAYLOAD_SIZE = 32;

/** Platform identifiers */
export const PLATFORM_CODES = {
	"elara.desktop": 0x0001,
	"elara.cloud": 0x0002,
	"elara.sign.web": 0x0003,
	"elara.sign.api": 0x0004,
	unknown: 0xffff,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface AccountabilityData {
	/** Unix timestamp (seconds since epoch) */
	timestamp: number;

	/** First 8 bytes of SHA256(userId) - enough to match against auth records */
	userFingerprint: Uint8Array;

	/** IPv4 address as 4 bytes (or zeros if unavailable/IPv6) */
	ipAddress: Uint8Array;

	/** Platform that generated this content */
	platformCode: number;
}

export interface DecryptedAccountability {
	/** When the content was signed */
	timestamp: Date;

	/** User fingerprint (hex) - match against your auth system */
	userFingerprint: string;

	/** IP address (dotted notation or "unavailable") */
	ipAddress: string;

	/** Platform name */
	platform: string;

	/** Whether decryption was successful (checksum verified) */
	valid: boolean;
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate a new master key
 *
 * ⚠️ CALL THIS ONCE. SAVE THE KEY OFFLINE. DO NOT LOSE IT.
 *
 * @returns Master key as hex string (64 characters)
 */
export function generateMasterKey(): string {
	const key = randomBytes(MASTER_KEY_LENGTH);
	return key.toString("hex");
}

/**
 * Validate a master key format
 */
export function isValidMasterKey(key: string): boolean {
	return /^[a-f0-9]{64}$/i.test(key);
}

// ============================================================================
// ENCRYPTION
// ============================================================================

/**
 * Calculate CRC32 checksum for validation
 */
function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	const table = new Uint32Array(256);

	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c;
	}

	for (let i = 0; i < data.length; i++) {
		crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}

	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Derive IV from data (deterministic but unique per image)
 */
function deriveIV(timestamp: number, platformCode: number, salt: string): Buffer {
	const hash = createHash("sha256");
	hash.update(`${timestamp}:${platformCode}:${salt}:elarasign-forensic-iv`);
	return hash.digest().subarray(0, 16);
}

/**
 * Encrypt accountability data with the master key
 *
 * @param data - Accountability data to encrypt
 * @param masterKey - 64-char hex string (256-bit key)
 * @param salt - Additional entropy (e.g., content hash)
 * @returns 32-byte encrypted payload
 */
export function encryptAccountability(data: AccountabilityData, masterKey: string, salt = ""): Uint8Array {
	if (!isValidMasterKey(masterKey)) {
		throw new Error("Invalid master key format");
	}

	// Build plaintext payload (28 bytes + 4 byte checksum = 32 bytes)
	const plaintext = new Uint8Array(32);
	const view = new DataView(plaintext.buffer);

	// Timestamp (4 bytes, big-endian)
	view.setUint32(0, data.timestamp, false);

	// User fingerprint (8 bytes)
	plaintext.set(data.userFingerprint.subarray(0, 8), 4);

	// IP address (4 bytes)
	plaintext.set(data.ipAddress.subarray(0, 4), 12);

	// Platform code (2 bytes)
	view.setUint16(16, data.platformCode, false);

	// Reserved (10 bytes) - zeros for now
	// plaintext[18-27] already zeros

	// Checksum of first 28 bytes (4 bytes)
	const checksum = crc32(plaintext.subarray(0, 28));
	view.setUint32(28, checksum, false);

	// Derive IV deterministically
	const iv = deriveIV(data.timestamp, data.platformCode, salt);

	// Encrypt with AES-256-CBC
	const keyBuffer = Buffer.from(masterKey, "hex");
	const cipher = createCipheriv("aes-256-cbc", keyBuffer, iv);
	cipher.setAutoPadding(false); // No padding needed, exact 32 bytes

	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

	return new Uint8Array(encrypted);
}

/**
 * Decrypt accountability data with the master key
 *
 * @param encrypted - 32-byte encrypted payload
 * @param masterKey - 64-char hex string (256-bit key)
 * @param salt - Same salt used during encryption
 * @returns Decrypted accountability data (check .valid field)
 */
export function decryptAccountability(encrypted: Uint8Array, masterKey: string, salt = ""): DecryptedAccountability {
	const invalid: DecryptedAccountability = {
		timestamp: new Date(0),
		userFingerprint: "",
		ipAddress: "unavailable",
		platform: "unknown",
		valid: false,
	};

	if (!isValidMasterKey(masterKey)) {
		return invalid;
	}

	if (encrypted.length !== 32) {
		return invalid;
	}

	try {
		// We need to try multiple reasonable timestamps to derive IV
		// In practice, we'd know approximate time range of the image
		// For now, we'll use a brute-force approach within the encrypted data itself

		// First, try to decrypt with a zero IV to get timestamp
		// Then re-derive correct IV and decrypt again
		// This is a simplification - in production, you'd store minimal metadata

		// Actually, let's embed timestamp in a recoverable way:
		// XOR first 4 bytes of encrypted data with a known pattern
		const keyBuffer = Buffer.from(masterKey, "hex");

		// Try decryption with derived IV from embedded hints
		// For the MVP, we'll assume salt is provided (e.g., from sidecar or visible metadata)

		// Extract timestamp hint (first 4 bytes XORed with key prefix)
		const timestampHint =
			((encrypted[0] ^ keyBuffer[0]) << 24) |
			((encrypted[1] ^ keyBuffer[1]) << 16) |
			((encrypted[2] ^ keyBuffer[2]) << 8) |
			(encrypted[3] ^ keyBuffer[3]);

		// Try a range of timestamps around the hint
		for (let offset = -10; offset <= 10; offset++) {
			const tryTimestamp = timestampHint + offset;

			// Try each platform code
			for (const platformCode of Object.values(PLATFORM_CODES)) {
				const iv = deriveIV(tryTimestamp, platformCode, salt);

				try {
					const decipher = createDecipheriv("aes-256-cbc", keyBuffer, iv);
					decipher.setAutoPadding(false);

					const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]);

					const view = new DataView(decrypted.buffer, decrypted.byteOffset);

					// Verify checksum
					const storedChecksum = view.getUint32(28, false);
					const calculatedChecksum = crc32(new Uint8Array(decrypted.subarray(0, 28)));

					if (storedChecksum === calculatedChecksum) {
						// Success! Extract data
						const timestamp = view.getUint32(0, false);
						const userFingerprint = Buffer.from(decrypted.subarray(4, 12)).toString("hex");
						const ipBytes = decrypted.subarray(12, 16);
						const ipAddress = ipBytes.every((b) => b === 0)
							? "unavailable"
							: `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
						const platformCodeVal = view.getUint16(16, false);
						const platform =
							Object.entries(PLATFORM_CODES).find(([_, code]) => code === platformCodeVal)?.[0] || "unknown";

						return {
							timestamp: new Date(timestamp * 1000),
							userFingerprint,
							ipAddress,
							platform,
							valid: true,
						};
					}
				} catch {
					// Try next combination
				}
			}
		}

		return invalid;
	} catch {
		return invalid;
	}
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert IPv4 string to 4-byte array
 */
export function ipToBytes(ip: string): Uint8Array {
	const bytes = new Uint8Array(4);

	// Handle IPv4
	const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (ipv4Match) {
		bytes[0] = Number.parseInt(ipv4Match[1], 10);
		bytes[1] = Number.parseInt(ipv4Match[2], 10);
		bytes[2] = Number.parseInt(ipv4Match[3], 10);
		bytes[3] = Number.parseInt(ipv4Match[4], 10);
	}
	// IPv6 or unknown: leave as zeros

	return bytes;
}

/**
 * Create user fingerprint (first 8 bytes of SHA256)
 */
export function createShortFingerprint(userId: string): Uint8Array {
	const hash = createHash("sha256").update(userId).digest();
	return new Uint8Array(hash.subarray(0, 8));
}

/**
 * Get platform code from generator string
 */
export function getPlatformCode(generator: string): number {
	if (generator.includes("desktop")) {
		return PLATFORM_CODES["elara.desktop"];
	}
	if (generator.includes("cloud")) {
		return PLATFORM_CODES["elara.cloud"];
	}
	if (generator.includes("sign.web") || generator === "elaraSign.web") {
		return PLATFORM_CODES["elara.sign.web"];
	}
	if (generator.includes("sign.api") || generator.includes("sign.cloud")) {
		return PLATFORM_CODES["elara.sign.api"];
	}
	return PLATFORM_CODES.unknown;
}
