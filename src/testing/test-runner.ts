/**
 * elaraSign Test Runner
 * ======================
 *
 * Uses supertest to test Express routes directly.
 * No server process needed - tests hit the app programmatically.
 *
 * Usage:
 *   npx tsx src/testing/test-runner.ts
 *   npx tsx src/testing/test-runner.ts --verbose
 */

import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { app } from "../cloud/server.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEST_FILES_DIR = path.resolve(import.meta.dirname, "../../test-files");
const VERBOSE = process.argv.includes("--verbose");

interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
	details?: string;
}

const results: TestResult[] = [];

// ============================================================================
// TEST UTILITIES
// ============================================================================

function log(msg: string) {
	console.log(msg);
}

function verbose(msg: string) {
	if (VERBOSE) {
		console.log(`    ${msg}`);
	}
}

function pass(name: string, details?: string) {
	results.push({ name, passed: true, details });
	log(`  ✅ ${name}`);
	if (details && VERBOSE) {
		verbose(details);
	}
}

function fail(name: string, error: string) {
	results.push({ name, passed: false, error });
	log(`  ❌ ${name}`);
	log(`     Error: ${error}`);
}

function skip(name: string, reason: string) {
	results.push({ name, passed: true, details: `SKIPPED: ${reason}` });
	log(`  ⏭️  ${name} (${reason})`);
}

// ============================================================================
// TEST CASES
// ============================================================================

async function testHealthEndpoint() {
	const name = "Health endpoint responds";
	try {
		const res = await request(app).get("/api/health");
		if (res.status === 200 && res.body.status === "ok") {
			pass(name, `Version: ${res.body.version}`);
		} else {
			fail(name, `Unexpected response: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testSignPNG() {
	const name = "Sign PNG image";
	const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.png");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-ai-generated.png not found");
		return;
	}

	try {
		const res = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "test-runner")
			.field("model", "test-model")
			.field("method", "ai");

		if (res.status === 200 && res.body.success && res.body.sessionId) {
			verbose(`Session: ${res.body.sessionId}`);
			verbose(`MetaHash: ${res.body.signature?.metaHash?.slice(0, 16)}...`);
			pass(name, `Session ${res.body.sessionId}`);

			// Download and verify
			await testDownloadAndVerify(res.body.sessionId, "PNG");
		} else {
			fail(name, `Status ${res.status}: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testSignJPEG() {
	const name = "Sign JPEG image";
	const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.jpg");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-ai-generated.jpg not found");
		return;
	}

	try {
		const res = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "test-runner")
			.field("model", "test-model")
			.field("method", "ai");

		if (res.status === 200 && res.body.success && res.body.sessionId) {
			pass(name, `Session ${res.body.sessionId}`);
			// Note: JPEG signing converts to PNG internally for watermarking
		} else {
			fail(name, `Status ${res.status}: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testSignWebP() {
	const name = "Sign WebP image";
	const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.webp");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-ai-generated.webp not found");
		return;
	}

	try {
		const res = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "test-runner")
			.field("method", "ai");

		if (res.status === 200 && res.body.success) {
			pass(name, `Session ${res.body.sessionId}`);
		} else {
			fail(name, `Status ${res.status}: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testSignPDF() {
	const name = "Sign PDF document";
	const filePath = path.join(TEST_FILES_DIR, "sample-document.pdf");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-document.pdf not found");
		return;
	}

	try {
		const res = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "test-runner")
			.field("method", "ai");

		if (res.status === 200 && res.body.success && res.body.type === "pdf") {
			pass(name, `Session ${res.body.sessionId}`);
		} else {
			fail(name, `Status ${res.status}: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testSignAudio() {
	const name = "Sign WAV audio";
	const filePath = path.join(TEST_FILES_DIR, "sample-audio.wav");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-audio.wav not found");
		return;
	}

	try {
		const res = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "test-runner")
			.field("model", "tts-test")
			.field("method", "ai");

		if (res.status === 200 && res.body.success && res.body.type === "audio") {
			pass(name, `Format: ${res.body.format}, Method: ${res.body.signature?.embeddingMethod}`);
		} else {
			fail(name, `Status ${res.status}: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testSignVideo() {
	const name = "Sign MP4 video (sidecar)";
	const filePath = path.join(TEST_FILES_DIR, "sample-video-short.mp4");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-video-short.mp4 not found");
		return;
	}

	try {
		const res = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "test-runner")
			.field("model", "video-model")
			.field("method", "ai")
			.field("duration", "5.0")
			.field("width", "1920")
			.field("height", "1080");

		if (res.status === 200 && res.body.success && res.body.type === "video") {
			const hasSidecar = res.body.sidecar && res.body.sidecar.marker === "elaraSign-video";
			if (hasSidecar) {
				pass(name, `Sidecar hash: ${res.body.sidecar.contentHash?.slice(0, 16)}...`);
			} else {
				fail(name, "Response missing sidecar manifest");
			}
		} else {
			fail(name, `Status ${res.status}: ${JSON.stringify(res.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testDownloadAndVerify(sessionId: string, format: string) {
	const name = `Download & verify ${format}`;
	try {
		const downloadRes = await request(app).get(`/api/download/${sessionId}?format=image`);

		if (downloadRes.status !== 200) {
			fail(name, `Download failed with status ${downloadRes.status}`);
			return;
		}

		const imageBuffer = downloadRes.body as Buffer;
		verbose(`Downloaded ${imageBuffer.length} bytes`);

		// Verify via the API endpoint (handles decoding internally)
		const verifyRes = await request(app)
			.post("/api/verify")
			.attach("file", imageBuffer, `test.${format.toLowerCase()}`);

		if (verifyRes.status === 200 && verifyRes.body.signed && verifyRes.body.verified) {
			pass(name, `Verified via API: metaHash=${verifyRes.body.signature?.metaHash?.slice(0, 16)}...`);
		} else {
			fail(name, `Verification failed: ${JSON.stringify(verifyRes.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testVerifyEndpoint() {
	const name = "Verify endpoint with signed image";
	const filePath = path.join(TEST_FILES_DIR, "sample-ai-generated.png");

	if (!fs.existsSync(filePath)) {
		skip(name, "sample-ai-generated.png not found");
		return;
	}

	try {
		// First sign an image
		const signRes = await request(app)
			.post("/api/sign")
			.attach("file", filePath)
			.field("generator", "verify-test")
			.field("method", "ai");

		if (!signRes.body.success) {
			fail(name, "Could not sign image for verification test");
			return;
		}

		// Download signed image
		const downloadRes = await request(app).get(`/api/download/${signRes.body.sessionId}?format=image`);

		if (downloadRes.status !== 200) {
			fail(name, "Could not download signed image");
			return;
		}

		// Verify via API
		const verifyRes = await request(app).post("/api/verify").attach("file", downloadRes.body, "signed.png");

		if (verifyRes.status === 200 && verifyRes.body.verified) {
			pass(name, `Metadata generator: ${verifyRes.body.metadata?.generator}`);
		} else {
			fail(name, `Verify returned: ${JSON.stringify(verifyRes.body)}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

async function testRejectUnsupportedFile() {
	const name = "Reject unsupported file type";
	try {
		// Try to upload a text file
		const res = await request(app)
			.post("/api/sign")
			.attach("file", Buffer.from("Hello World"), "test.txt")
			.field("generator", "test");

		if (res.status === 400) {
			pass(name, "Correctly rejected with 400 Bad Request");
		} else {
			fail(name, `Expected 400, got ${res.status}`);
		}
	} catch (err) {
		fail(name, err instanceof Error ? err.message : String(err));
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	console.log(`\n${"=".repeat(70)}`);
	console.log("                    elaraSign Test Suite (supertest)");
	console.log(`${"=".repeat(70)}\n`);

	// Check test files exist
	if (!fs.existsSync(TEST_FILES_DIR)) {
		console.error(`❌ Test files directory not found: ${TEST_FILES_DIR}`);
		console.error("   Run: npm run setup-tests");
		process.exit(1);
	}

	const files = fs.readdirSync(TEST_FILES_DIR);
	log(`📁 Test files: ${files.filter((f) => !f.endsWith(".json") && !f.endsWith(".md")).join(", ")}\n`);

	// Run tests
	log("🔐 API Tests:\n");

	await testHealthEndpoint();
	await testRejectUnsupportedFile();

	log("\n📸 Image Signing:\n");

	await testSignPNG();
	await testSignJPEG();
	await testSignWebP();

	log("\n📄 Document Signing:\n");

	await testSignPDF();

	log("\n🎵 Audio Signing:\n");

	await testSignAudio();

	log("\n🎬 Video Signing:\n");

	await testSignVideo();

	log("\n🔍 Verification:\n");

	await testVerifyEndpoint();

	// Summary
	console.log(`\n${"=".repeat(70)}`);
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	const skipped = results.filter((r) => r.details?.startsWith("SKIPPED")).length;

	console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

	if (failed > 0) {
		console.log("❌ SOME TESTS FAILED\n");
		process.exit(1);
	} else {
		console.log("✅ ALL TESTS PASSED\n");
		process.exit(0);
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
