/**
 * Core Signing Tests
 * ===================
 *
 * Unit tests for cryptographic signing functions using public API.
 * Tests basic functionality without requiring full image processing.
 *
 * Run: npm run test:unit
 */

import { describe, expect, it } from "vitest";
import {
	crc32,
	createMetadata,
	ELARA_MARKER,
	ELARA_VERSION,
	extractMultiLocationSignature,
	hasElaraSignature,
	SIGNATURE_LOCATIONS,
} from "../signing-core.js";

describe("CRC32 Checksumming", () => {
	it("should produce consistent checksums", () => {
		const data1 = new Uint8Array([1, 2, 3, 4, 5]);
		const crc1 = crc32(data1);
		const crc2 = crc32(data1);

		expect(crc1).toBe(crc2);
	});

	it("should produce different checksums for different data", () => {
		const data1 = new Uint8Array([1, 2, 3, 4, 5]);
		const data2 = new Uint8Array([5, 4, 3, 2, 1]);

		const crc1 = crc32(data1);
		const crc2 = crc32(data2);

		expect(crc1).not.toBe(crc2);
	});

	it("should detect single bit changes", () => {
		const data1 = new Uint8Array([0xff, 0xff, 0xff]);
		const data2 = new Uint8Array([0xfe, 0xff, 0xff]);

		const crc1 = crc32(data1);
		const crc2 = crc32(data2);

		expect(crc1).not.toBe(crc2);
	});
});

describe("Signature Detection", () => {
	it("should detect absence of signature in blank image", () => {
		const width = 100;
		const height = 100;
		const pixels = new Uint8ClampedArray(width * height * 4);

		// Fill with white
		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = 255;
		}

		const hasSignature = hasElaraSignature(pixels, width, height);
		expect(hasSignature).toBe(false);
	});

	it("should detect absence of signature in random noise", () => {
		const width = 200;
		const height = 200;
		const pixels = new Uint8ClampedArray(width * height * 4);

		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = Math.floor(Math.random() * 256);
		}

		const hasSignature = hasElaraSignature(pixels, width, height);
		expect(hasSignature).toBe(false);
	});
});

describe("Multi-Location Signature Extraction", () => {
	it("should find no valid signatures in unsigned image", () => {
		const width = 200;
		const height = 200;
		const pixels = new Uint8ClampedArray(width * height * 4);

		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = 128;
		}

		const result = extractMultiLocationSignature(pixels, width, height);

		expect(result.validLocations.length).toBe(0);
		expect(result.bestSignature).toBeNull();
	});

	it("should handle images too small for signatures", () => {
		const width = 10;
		const height = 10;
		const pixels = new Uint8ClampedArray(width * height * 4);

		const result = extractMultiLocationSignature(pixels, width, height);

		expect(result.validLocations.length).toBe(0);
		expect(result.invalidLocations.length).toBeGreaterThan(0);
	});
});

describe("Metadata Creation", () => {
	it("should create valid metadata with correct structure", () => {
		const params = {
			generator: "elara.cloud",
			userFingerprint: "0102030405060708",
			keyFingerprint: "abcd1234",
			contentType: "image" as const,
			contentHash: "abc123def456",
			characterId: "char-001",
			modelUsed: "SDXL",
			promptHash: "prompt-hash-123",
		};

		const metadata = createMetadata(params);

		expect(metadata.signatureVersion).toBe("3.0");
		expect(metadata.generator).toBe("elara.cloud");
		expect(metadata.userFingerprint).toBe("0102030405060708");
		expect(metadata.contentType).toBe("image");
		expect(metadata.generatedAt).toBeDefined();
	});

	it("should create ISO8601 timestamps", () => {
		const params = {
			generator: "elara.desktop",
			userFingerprint: "1234567890abcdef",
			keyFingerprint: "key123",
			contentType: "image" as const,
			contentHash: "hash123",
			characterId: "char-002",
			modelUsed: "FLUX",
			promptHash: "prompt-hash-456",
		};

		const metadata = createMetadata(params);

		// Verify ISO8601 format
		expect(metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});
});

describe("Constants and Configuration", () => {
	it("should have correct marker string", () => {
		expect(ELARA_MARKER).toBe("ELARA3");
		expect(ELARA_MARKER.length).toBe(6);
	});

	it("should have correct version", () => {
		expect(ELARA_VERSION).toBe(0x03);
	});

	it("should have 5 signature locations defined", () => {
		const locations = SIGNATURE_LOCATIONS;
		expect(locations.topLeft).toBeDefined();
		expect(locations.topRight).toBeDefined();
		expect(locations.bottomLeft).toBeDefined();
		expect(locations.bottomRight).toBeDefined();
		expect(locations.center).toBeDefined();
	});

	it("should have valid location dimensions", () => {
		// Top-left should be horizontal
		expect(SIGNATURE_LOCATIONS.topLeft.width).toBe(48);
		expect(SIGNATURE_LOCATIONS.topLeft.height).toBe(4);

		// Top-right should be vertical
		expect(SIGNATURE_LOCATIONS.topRight.width).toBe(4);
		expect(SIGNATURE_LOCATIONS.topRight.height).toBe(48);

		// Center should be horizontal
		expect(SIGNATURE_LOCATIONS.center.width).toBe(48);
		expect(SIGNATURE_LOCATIONS.center.height).toBe(4);
	});
});

describe("LSB Encoding Principle", () => {
	it("should encode and decode arbitrary data perfectly", () => {
		const pixels = new Uint8ClampedArray(100);

		// Fill with known pattern
		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = 170; // 10101010 binary
		}

		const testData = new Uint8Array([0x00, 0xff, 0xaa, 0x55, 0x12, 0x34]);

		// Manually encode in LSB
		for (let i = 0; i < testData.length; i++) {
			const byte = testData[i];
			for (let bit = 0; bit < 8; bit++) {
				const pixelIdx = i * 8 + bit;
				const bitValue = (byte >> bit) & 1;
				pixels[pixelIdx] = (pixels[pixelIdx] & 0xfe) | bitValue;
			}
		}

		// Manually decode
		const decoded = new Uint8Array(testData.length);
		for (let i = 0; i < testData.length; i++) {
			let byte = 0;
			for (let bit = 0; bit < 8; bit++) {
				const pixelIdx = i * 8 + bit;
				const bitValue = pixels[pixelIdx] & 1;
				byte |= bitValue << bit;
			}
			decoded[i] = byte;
		}

		// Verify bit-perfect encoding/decoding
		for (let i = 0; i < testData.length; i++) {
			expect(decoded[i]).toBe(testData[i]);
		}
	});

	it("should have minimal visual impact on pixels", () => {
		const pixels = new Uint8ClampedArray(1000);

		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = 128;
		}

		const original = new Uint8ClampedArray(pixels);

		// Flip all LSBs
		for (let i = 0; i < pixels.length; i++) {
			pixels[i] ^= 1;
		}

		// Check maximum difference is 1
		for (let i = 0; i < pixels.length; i++) {
			expect(Math.abs(pixels[i] - original[i])).toBeLessThanOrEqual(1);
		}
	});
});
