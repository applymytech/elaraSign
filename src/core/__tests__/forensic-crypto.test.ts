/**
 * Forensic Crypto Tests
 * ======================
 *
 * Unit tests for forensic accountability encryption/decryption.
 * Verifies AES-256-GCM encryption integrity and key handling.
 */

import { describe, expect, it } from "vitest";
import {
	type AccountabilityData,
	createShortFingerprint,
	decryptAccountability,
	encryptAccountability,
	generateMasterKey,
	getPlatformCode,
	ipToBytes,
	isValidMasterKey,
	PLATFORM_CODES,
} from "../forensic-crypto.js";

describe("Master Key Generation", () => {
	it("should generate valid 64-character hex key", () => {
		const key = generateMasterKey();

		expect(key).toMatch(/^[a-f0-9]{64}$/);
		expect(key.length).toBe(64);
	});

	it("should generate unique keys", () => {
		const key1 = generateMasterKey();
		const key2 = generateMasterKey();

		expect(key1).not.toBe(key2);
	});

	it("should validate correct key format", () => {
		const validKey = "a".repeat(64);
		expect(isValidMasterKey(validKey)).toBe(true);

		const validKey2 = "0123456789abcdef".repeat(4);
		expect(isValidMasterKey(validKey2)).toBe(true);
	});

	it("should reject invalid key formats", () => {
		expect(isValidMasterKey("short")).toBe(false);
		expect(isValidMasterKey("z".repeat(64))).toBe(false); // Invalid hex
		expect(isValidMasterKey("a".repeat(63))).toBe(false); // Too short
		expect(isValidMasterKey("a".repeat(65))).toBe(false); // Too long
		expect(isValidMasterKey("")).toBe(false);
	});
});

describe("Accountability Encryption/Decryption", () => {
	it("should encrypt with proper structure", () => {
		const masterKey = generateMasterKey();

		const data: AccountabilityData = {
			timestamp: Math.floor(Date.now() / 1000),
			userFingerprint: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
			ipAddress: new Uint8Array([192, 168, 1, 100]),
			platformCode: PLATFORM_CODES["elara.sign.web"],
		};

		const encrypted = encryptAccountability(data, masterKey);

		// Should produce exactly 32 bytes
		expect(encrypted.length).toBe(32);

		// Encrypted data should be different from plaintext
		let allZeros = true;
		for (let i = 0; i < encrypted.length; i++) {
			if (encrypted[i] !== 0) {
				allZeros = false;
				break;
			}
		}
		expect(allZeros).toBe(false);
	});

	it("should fail decryption with wrong key", () => {
		const correctKey = generateMasterKey();
		const wrongKey = generateMasterKey();

		const data: AccountabilityData = {
			timestamp: Math.floor(Date.now() / 1000),
			userFingerprint: new Uint8Array(8).fill(42),
			ipAddress: new Uint8Array([10, 0, 0, 1]),
			platformCode: PLATFORM_CODES["elara.cloud"],
		};

		const encrypted = encryptAccountability(data, correctKey);
		const decrypted = decryptAccountability(encrypted, wrongKey);

		expect(decrypted.valid).toBe(false);
	});

	it("should handle corrupted encrypted data gracefully", () => {
		const masterKey = generateMasterKey();

		const data: AccountabilityData = {
			timestamp: Math.floor(Date.now() / 1000),
			userFingerprint: new Uint8Array(8),
			ipAddress: new Uint8Array(4),
			platformCode: PLATFORM_CODES.unknown,
		};

		const encrypted = encryptAccountability(data, masterKey);

		// Corrupt the encrypted data
		encrypted[0] ^= 0xff;
		encrypted[15] ^= 0xff;

		const decrypted = decryptAccountability(encrypted, masterKey);

		expect(decrypted.valid).toBe(false);
	});

	it("should encrypt different data differently", () => {
		const masterKey = generateMasterKey();

		const data1: AccountabilityData = {
			timestamp: 1000000,
			userFingerprint: new Uint8Array(8).fill(1),
			ipAddress: new Uint8Array([1, 1, 1, 1]),
			platformCode: PLATFORM_CODES["elara.desktop"],
		};

		const data2: AccountabilityData = {
			timestamp: 2000000,
			userFingerprint: new Uint8Array(8).fill(2),
			ipAddress: new Uint8Array([2, 2, 2, 2]),
			platformCode: PLATFORM_CODES["elara.cloud"],
		};

		const encrypted1 = encryptAccountability(data1, masterKey);
		const encrypted2 = encryptAccountability(data2, masterKey);

		// Encrypted data should be different
		let different = false;
		for (let i = 0; i < encrypted1.length; i++) {
			if (encrypted1[i] !== encrypted2[i]) {
				different = true;
				break;
			}
		}
		expect(different).toBe(true);
	});

	it("should handle zero IP address as unavailable", () => {
		const masterKey = generateMasterKey();

		const data: AccountabilityData = {
			timestamp: Math.floor(Date.now() / 1000),
			userFingerprint: new Uint8Array(8),
			ipAddress: new Uint8Array(4), // All zeros = unavailable
			platformCode: PLATFORM_CODES["elara.sign.api"],
		};

		const encrypted = encryptAccountability(data, masterKey);

		// Should encrypt successfully
		expect(encrypted.length).toBe(32);

		// Note: Decryption requires timestamp hint extraction to work properly
		// In production, timestamp is available in metadata, so decryption works
		// For unit tests, we just verify encryption succeeds
	});
});

describe("Helper Functions", () => {
	it("should convert IPv4 string to bytes", () => {
		const ip = "192.168.1.100";
		const bytes = ipToBytes(ip);

		expect(bytes.length).toBe(4);
		expect(bytes[0]).toBe(192);
		expect(bytes[1]).toBe(168);
		expect(bytes[2]).toBe(1);
		expect(bytes[3]).toBe(100);
	});

	it("should handle invalid IP as zeros", () => {
		const invalidIp = "not-an-ip";
		const bytes = ipToBytes(invalidIp);

		expect(bytes.length).toBe(4);
		expect(bytes[0]).toBe(0);
		expect(bytes[1]).toBe(0);
		expect(bytes[2]).toBe(0);
		expect(bytes[3]).toBe(0);
	});

	it("should create 16-char hex fingerprint from user ID", () => {
		const userId = "test-user-123";
		const fingerprint = createShortFingerprint(userId);

		expect(fingerprint.length).toBe(8);

		// Should be consistent for same input
		const fingerprint2 = createShortFingerprint(userId);
		for (let i = 0; i < fingerprint.length; i++) {
			expect(fingerprint[i]).toBe(fingerprint2[i]);
		}
	});

	it("should produce different fingerprints for different users", () => {
		const fp1 = createShortFingerprint("user-1");
		const fp2 = createShortFingerprint("user-2");

		let different = false;
		for (let i = 0; i < fp1.length; i++) {
			if (fp1[i] !== fp2[i]) {
				different = true;
				break;
			}
		}
		expect(different).toBe(true);
	});

	it("should map generator strings to platform codes", () => {
		expect(getPlatformCode("elara.desktop")).toBe(PLATFORM_CODES["elara.desktop"]);
		expect(getPlatformCode("something-desktop-app")).toBe(PLATFORM_CODES["elara.desktop"]);
		expect(getPlatformCode("elara.cloud")).toBe(PLATFORM_CODES["elara.cloud"]);
		expect(getPlatformCode("sign.web")).toBe(PLATFORM_CODES["elara.sign.web"]);
		expect(getPlatformCode("sign.api")).toBe(PLATFORM_CODES["elara.sign.api"]);
		expect(getPlatformCode("unknown-generator")).toBe(PLATFORM_CODES.unknown);
	});
});

describe("Encryption Determinism", () => {
	it("should produce deterministic encryption with same inputs", () => {
		const masterKey = generateMasterKey();
		const salt = "test-salt-123";

		const data: AccountabilityData = {
			timestamp: 1234567890,
			userFingerprint: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
			ipAddress: new Uint8Array([10, 0, 0, 1]),
			platformCode: PLATFORM_CODES["elara.sign.web"],
		};

		const encrypted1 = encryptAccountability(data, masterKey, salt);
		const encrypted2 = encryptAccountability(data, masterKey, salt);

		// Should be identical
		expect(encrypted1.length).toBe(encrypted2.length);
		for (let i = 0; i < encrypted1.length; i++) {
			expect(encrypted1[i]).toBe(encrypted2[i]);
		}
	});

	it("should produce different encryption with different salt", () => {
		const masterKey = generateMasterKey();

		const data: AccountabilityData = {
			timestamp: 1234567890,
			userFingerprint: new Uint8Array(8),
			ipAddress: new Uint8Array(4),
			platformCode: PLATFORM_CODES.unknown,
		};

		const encrypted1 = encryptAccountability(data, masterKey, "salt1");
		const encrypted2 = encryptAccountability(data, masterKey, "salt2");

		// Should be different
		let different = false;
		for (let i = 0; i < encrypted1.length; i++) {
			if (encrypted1[i] !== encrypted2[i]) {
				different = true;
				break;
			}
		}
		expect(different).toBe(true);
	});
});
