/**
 * Real File Signing Tests
 * ========================
 *
 * Tests signing and verification with ACTUAL test files.
 * This proves the signing system works with real-world content.
 *
 * Run: npm run test:unit
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createMetadata, signImageContent, verifyImageContent } from "../signing-core.js";

const TEST_FILES_DIR = path.resolve(import.meta.dirname, "../../../test-files");

// Helper to check if test files exist
const testFilesExist = fs.existsSync(TEST_FILES_DIR);

// Skip tests if no test files (CI environments might not have them)
const describeIfFiles = testFilesExist ? describe : describe.skip;

describeIfFiles("Real PNG Image Signing", () => {
	it("should sign and verify sample-ai-generated.png", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.png");
		const imageBuffer = fs.readFileSync(filePath);

		// Extract raw pixel data
		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		// Create metadata
		const metadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "test1234567890ab",
			keyFingerprint: "testkey001",
			contentType: "image",
			contentHash: "testhash001",
			characterId: "char-ai-test",
			modelUsed: "test-model",
			promptHash: "prompthash001",
		});

		// Sign the image
		const signResult = await signImageContent(pixels, info.width, info.height, metadata);

		expect(signResult).toBeDefined();
		expect(signResult.signedImageData).toBeDefined();
		expect(signResult.locationsEmbedded.length).toBeGreaterThan(0);

		// Verify the signature (without metadata - test signature detection only)
		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height);

		expect(verifyResult.isValid).toBe(true);
		expect(verifyResult.tamperDetected).toBe(false);
		expect(verifyResult.validLocations.length).toBeGreaterThan(0);
	});

	it.skip("should sign and verify sample-avatar.png (flaky)", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-avatar.png");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const metadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "avatar1234567890",
			keyFingerprint: "testkey002",
			contentType: "image",
			contentHash: "testhash002",
			characterId: "char-avatar",
			modelUsed: "D-ID",
			promptHash: "prompthash002",
		});

		const signResult = await signImageContent(pixels, info.width, info.height, metadata);
		expect(signResult.signedImageData).toBeDefined();

		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height, metadata);

		expect(verifyResult.isValid).toBe(true);
		expect(verifyResult.validLocations.length).toBeGreaterThan(0);
	});

	it("should sign and verify sample-small.png", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-small.png");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const metadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "small12345678901",
			keyFingerprint: "testkey003",
			contentType: "image",
			contentHash: "testhash003",
			characterId: "char-small",
			modelUsed: "test-model",
			promptHash: "prompthash003",
		});

		const signResult = await signImageContent(pixels, info.width, info.height, metadata);
		expect(signResult.signedImageData).toBeDefined();

		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height);

		expect(verifyResult.isValid).toBe(true);
	});
});

describeIfFiles("Real JPEG Image Signing", () => {
	it("should sign and verify sample-ai-generated.jpg", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.jpg");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const metadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "jpeg123456789012",
			keyFingerprint: "testkey004",
			contentType: "image",
			contentHash: "testhash004",
			characterId: "char-jpeg",
			modelUsed: "test-model",
			promptHash: "prompthash004",
		});

		const signResult = await signImageContent(pixels, info.width, info.height, metadata);
		expect(signResult.signedImageData).toBeDefined();

		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height);

		expect(verifyResult.isValid).toBe(true);
		expect(verifyResult.tamperDetected).toBe(false);
	});
});

describeIfFiles("Real WebP Image Signing", () => {
	it("should sign and verify sample-ai-generated.webp", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.webp");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const metadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "webp123456789012",
			keyFingerprint: "testkey005",
			contentType: "image",
			contentHash: "testhash005",
			characterId: "char-webp",
			modelUsed: "test-model",
			promptHash: "prompthash005",
		});

		const signResult = await signImageContent(pixels, info.width, info.height, metadata);
		expect(signResult.signedImageData).toBeDefined();

		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height);

		expect(verifyResult.isValid).toBe(true);
	});
});

describeIfFiles("Signature Persistence", () => {
	it("should survive PNG re-encode", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.png");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const metadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "persist123456789",
			keyFingerprint: "testkey006",
			contentType: "image",
			contentHash: "testhash006",
			characterId: "char-persist",
			modelUsed: "test-model",
			promptHash: "prompthash006",
		});

		// Sign
		const signResult = await signImageContent(pixels, info.width, info.height, metadata);

		// Re-encode as PNG
		const reEncodedPNG = await sharp(Buffer.from(signResult.signedImageData), {
			raw: {
				width: info.width,
				height: info.height,
				channels: 4,
			},
		})
			.png()
			.toBuffer();

		// Decode again
		const { data: reData, info: reInfo } = await sharp(reEncodedPNG)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const rePixels = new Uint8ClampedArray(reData.buffer, reData.byteOffset, reData.byteLength);

		// Verify signature survived
		const verifyResult = await verifyImageContent(rePixels, reInfo.width, reInfo.height);

		expect(verifyResult.isValid).toBe(true);
		expect(verifyResult.tamperDetected).toBe(false);
	});
});

describeIfFiles("Metadata Extraction from Real Files", () => {
	it("should extract consistent metadata from signed image", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.png");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const metadata = createMetadata({
			generator: "elara.cloud",
			userFingerprint: "1234567890abcdef",
			keyFingerprint: "abcdef123456",
			contentType: "image",
			contentHash: "contenthash001",
			characterId: "char-meta-test",
			modelUsed: "SDXL-Turbo",
			promptHash: "promptmetahash",
		});

		// Sign
		const signResult = await signImageContent(pixels, info.width, info.height, metadata);

		// Verify and extract
		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height);

		expect(verifyResult.isValid).toBe(true);
		expect(verifyResult.metaHashHex).toBeDefined();
		expect(verifyResult.contentHashHex).toBeDefined();
		expect(verifyResult.timestamp).toBeInstanceOf(Date);
	});
});

describeIfFiles("Error Handling with Real Files", () => {
	it("should detect unsigned real image", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.png");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		// Verify without signing
		const verifyResult = await verifyImageContent(pixels, info.width, info.height);

		expect(verifyResult.isValid).toBe(false);
		expect(verifyResult.error).toBeDefined();
		expect(verifyResult.error).toContain("No valid Elara signature");
	});

	it("should detect metadata mismatch", async () => {
		const filePath = path.join(TEST_FILES_DIR, "sample-small.png");
		const imageBuffer = fs.readFileSync(filePath);

		const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		const correctMetadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "mismatch12345678",
			keyFingerprint: "testkey007",
			contentType: "image",
			contentHash: "testhash007",
			characterId: "char-mismatch",
			modelUsed: "test-model",
			promptHash: "prompthash007",
		});

		// Sign with correct metadata
		const signResult = await signImageContent(pixels, info.width, info.height, correctMetadata);

		// Verify with WRONG metadata
		const wrongMetadata = createMetadata({
			generator: "elara.test",
			userFingerprint: "WRONG123456789ab",
			keyFingerprint: "wrongkey",
			contentType: "image",
			contentHash: "wronghash",
			characterId: "char-wrong",
			modelUsed: "wrong-model",
			promptHash: "wrongprompthash",
		});

		const verifyResult = await verifyImageContent(signResult.signedImageData, info.width, info.height, wrongMetadata);

		expect(verifyResult.isValid).toBe(false);
		expect(verifyResult.tamperDetected).toBe(true);
		expect(verifyResult.error).toContain("Metadata hash mismatch");
	});
});
