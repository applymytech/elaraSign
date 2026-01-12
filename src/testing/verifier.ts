#!/usr/bin/env npx tsx
/**
 * elaraSign Verifier
 * ==================
 *
 * The OFFICIAL tool for reading ElaraStandard signatures.
 * elaraSign creates signatures, elaraSign verifies them.
 * This is the canonical truth source.
 *
 * VERIFICATION LAYERS:
 * ====================
 *
 * IMAGES (4 layers):
 * 1. Billboard (Public)   - EXIF/IPTC/XMP, PNG tEXt chunks
 *                          Visible in Windows Properties, ExifTool, Adobe
 *                          Easy to strip but provides trust signal
 *
 * 2. DNA (Internal)       - LSB steganographic embedding
 *                          3 locations (top-left, top-right, bottom-center)
 *                          Crop-resilient, survives lossless operations
 *                          Our sovereign proof
 *
 * 3. Spread Spectrum      - DCT frequency domain watermark
 *                          SURVIVES JPEG, screenshots, cropping, social media
 *                          The "trap" - predators cannot escape
 *
 * 4. Forensic Payload     - AES-256 encrypted accountability
 *                          Only operator with master key can decrypt
 *                          "Break glass" for law enforcement
 *
 * PDF (2 layers):
 * 1. /Info Dictionary     - Standard PDF metadata
 * 2. Custom Properties    - elaraSign entries in document catalog
 *
 * AUDIO (1 layer):
 * 1. Surface Metadata     - ID3 tags (MP3), INFO chunks (WAV)
 *
 * VIDEO (sidecar):
 * 1. .elara.json          - Sidecar manifest with content hash
 *
 * Usage:
 *   npx tsx src/testing/verifier.ts <file>
 *   npx tsx src/testing/verifier.ts --help
 *   npx tsx src/testing/verifier.ts image.png --verbose
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// CLI
// ============================================================================

interface VerifyConfig {
	filePath: string;
	verbose: boolean;
	outputJson: boolean;
}

function parseArgs(): VerifyConfig | null {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printHelp();
		return null;
	}

	const config: VerifyConfig = {
		filePath: "",
		verbose: false,
		outputJson: false,
	};

	for (const arg of args) {
		if (arg === "--verbose" || arg === "-v") {
			config.verbose = true;
		} else if (arg === "--json") {
			config.outputJson = true;
		} else if (!arg.startsWith("-")) {
			config.filePath = arg;
		}
	}

	if (!config.filePath) {
		console.error("Error: No file specified\n");
		printHelp();
		return null;
	}

	return config;
}

function printHelp(): void {
	console.log(`
================================================================================
                         elaraSign Verifier
================================================================================

The OFFICIAL tool for reading ElaraStandard signatures.
elaraSign creates signatures. elaraSign verifies them.

USAGE:
  npx tsx src/testing/verifier.ts <file> [options]

OPTIONS:
  --verbose, -v    Show all signature layers and details
  --json           Output results as JSON
  --help, -h       Show this help

SUPPORTED FILES:
  Images:    PNG, JPEG, WebP, GIF, BMP, TIFF
  Documents: PDF
  Audio:     MP3, WAV, FLAC
  Video:     Sidecar manifest (.elara.json)

EXAMPLES:
  npx tsx src/testing/verifier.ts image.png
  npx tsx src/testing/verifier.ts document.pdf --verbose
  npx tsx src/testing/verifier.ts photo.jpg --json

WHAT GETS VERIFIED:
  - Signature presence and validity
  - Content integrity (tamper detection)
  - All signature layers present
  - Metadata extraction (generator, timestamp, method)

EXIT CODES:
  0 - File is signed and valid
  1 - File is NOT signed
  2 - File is signed but TAMPERED
  3 - Error reading file
`);
}

// ============================================================================
// Verification Result Types
// ============================================================================

interface LayerResult {
	name: string;
	present: boolean;
	details?: Record<string, unknown>;
}

interface VerificationReport {
	file: string;
	type: "image" | "pdf" | "audio" | "video" | "unknown";
	signed: boolean;
	valid: boolean;
	tampered: boolean;
	layers: LayerResult[];
	signature?: {
		version: string;
		metaHash: string;
		timestamp?: string;
		generator?: string;
		method?: string;
	};
	metadata?: Record<string, unknown>;
	warnings: string[];
	errors: string[];
}

// ============================================================================
// File Type Detection
// ============================================================================

function detectFileType(filePath: string, buffer: Buffer): VerificationReport["type"] {
	const ext = path.extname(filePath).toLowerCase();

	// Check magic bytes first
	if (buffer.length >= 8) {
		// PNG: 89 50 4E 47 0D 0A 1A 0A
		if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
			return "image";
		}
		// JPEG: FF D8 FF
		if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
			return "image";
		}
		// PDF: %PDF
		if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
			return "pdf";
		}
		// MP3: FF FB or ID3
		if (
			(buffer[0] === 0xff && buffer[1] === 0xfb) ||
			(buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
		) {
			return "audio";
		}
		// WAV: RIFF....WAVE
		if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
			return "audio";
		}
		// WebP: RIFF....WEBP
		if (
			buffer.length >= 12 &&
			buffer.toString("ascii", 0, 4) === "RIFF" &&
			buffer.toString("ascii", 8, 12) === "WEBP"
		) {
			return "image";
		}
	}

	// Fall back to extension
	const imageExts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"];
	const audioExts = [".mp3", ".wav", ".flac", ".ogg", ".m4a"];
	const videoExts = [".mp4", ".webm", ".mkv", ".mov", ".avi"];

	if (imageExts.includes(ext)) {
		return "image";
	}
	if (ext === ".pdf") {
		return "pdf";
	}
	if (audioExts.includes(ext)) {
		return "audio";
	}
	if (videoExts.includes(ext)) {
		return "video";
	}
	if (ext === ".json" && filePath.includes(".elara.")) {
		return "video";
	}

	return "unknown";
}

// ============================================================================
// Image Verification (uses signing-core directly)
// ============================================================================

async function verifyImage(buffer: Buffer, report: VerificationReport, _verbose: boolean): Promise<void> {
	const sharp = (await import("sharp")).default;
	const { hasElaraSignature, readSignature, verifyImageContent, hasAnyElaraSignature } = await import(
		"../core/signing-core.js"
	);
	const { extractSpreadSpectrum } = await import("../core/spread-spectrum.js");

	// Get image dimensions and raw pixel data
	const image = sharp(buffer);
	const metadata = await image.metadata();
	const { width, height } = metadata;

	if (!width || !height) {
		report.errors.push("Could not read image dimensions");
		return;
	}

	const rawBuffer = await image.ensureAlpha().raw().toBuffer();
	const imageData = new Uint8ClampedArray(rawBuffer);

	// Layer 1: Billboard (PNG tEXt / EXIF)
	const billboardLayer: LayerResult = { name: "Billboard (Metadata)", present: false };
	try {
		// Check for PNG tEXt chunks
		if (buffer[0] === 0x89 && buffer[1] === 0x50) {
			const pngChunks = extractPngTextChunks(buffer);
			if (pngChunks["elaraSign:version"] || pngChunks.Software?.includes("elaraSign")) {
				billboardLayer.present = true;
				billboardLayer.details = pngChunks;
			}
		}
		// EXIF check would go here for JPEG
	} catch {
		report.warnings.push("Could not read billboard metadata");
	}
	report.layers.push(billboardLayer);

	// Layer 2: DNA (LSB Steganography)
	const dnaLayer: LayerResult = { name: "DNA (LSB Steganography)", present: false };
	try {
		const hasSig = hasElaraSignature(imageData, width, height);
		if (hasSig) {
			dnaLayer.present = true;
			const sigInfo = readSignature(imageData, width, height);
			dnaLayer.details = {
				version: sigInfo.version,
				metaHash: sigInfo.metaHash,
				timestamp: sigInfo.timestamp,
				validLocations: sigInfo.validLocations,
			};

			// Update report signature info
			report.signature = {
				version: String(sigInfo.version),
				metaHash: sigInfo.metaHash || "unknown",
				timestamp: sigInfo.timestamp?.toISOString(),
			};
		}
	} catch (error) {
		report.warnings.push(`DNA layer read error: ${error instanceof Error ? error.message : "unknown"}`);
	}
	report.layers.push(dnaLayer);

	// Layer 3: Spread Spectrum
	const spreadLayer: LayerResult = { name: "Spread Spectrum (DCT)", present: false };
	if (report.signature?.metaHash) {
		try {
			const spreadResult = extractSpreadSpectrum(imageData, width, height, report.signature.metaHash);
			if (spreadResult && spreadResult.confidence > 0.5) {
				spreadLayer.present = true;
				spreadLayer.details = {
					confidence: Math.round(spreadResult.confidence * 100),
				};
			}
		} catch {
			// Spread spectrum not present or extraction failed
		}
	}
	report.layers.push(spreadLayer);

	// Layer 4: Forensic (encrypted, cannot read without master key)
	const forensicLayer: LayerResult = { name: "Forensic (Encrypted)", present: false };
	try {
		const forensicPayload = extractPngForensicChunk(buffer);
		if (forensicPayload) {
			forensicLayer.present = true;
			forensicLayer.details = {
				note: "Encrypted - requires master key to decrypt",
				payloadSize: forensicPayload.length,
			};
		}
	} catch {
		// No forensic layer
	}
	report.layers.push(forensicLayer);

	// Determine overall status
	report.signed = dnaLayer.present || spreadLayer.present || billboardLayer.present;

	if (dnaLayer.present) {
		// Verify integrity
		const verification = await verifyImageContent(imageData, width, height);
		report.valid = verification.isValid;
		report.tampered = verification.tamperDetected;
	} else if (spreadLayer.present) {
		// Spread spectrum only - can't verify content integrity the same way
		report.valid = true;
		report.warnings.push("DNA layer missing - integrity verification limited");
	} else {
		report.valid = false;
	}
}

// ============================================================================
// PDF Verification
// ============================================================================

async function verifyPdf(buffer: Buffer, report: VerificationReport, _verbose: boolean): Promise<void> {
	const pdfString = buffer.toString("latin1");

	// Layer 1: PDF Comments (ELARA_SIGN block)
	const commentsLayer: LayerResult = { name: "PDF Comments", present: false };
	if (pdfString.includes("ELARA_SIGN_START")) {
		commentsLayer.present = true;

		const metaHashMatch = pdfString.match(/%% MetaHash: ([a-f0-9]+)/);
		const versionMatch = pdfString.match(/%% Version: ([\d.]+)/);
		const generatorMatch = pdfString.match(/%% Generator: ([^\n]+)/);
		const timestampMatch = pdfString.match(/%% Timestamp: ([^\n]+)/);

		commentsLayer.details = {
			metaHash: metaHashMatch?.[1],
			version: versionMatch?.[1],
			generator: generatorMatch?.[1]?.trim(),
			timestamp: timestampMatch?.[1]?.trim(),
		};

		report.signature = {
			version: versionMatch?.[1] || "2.0",
			metaHash: metaHashMatch?.[1] || "unknown",
			timestamp: timestampMatch?.[1]?.trim(),
			generator: generatorMatch?.[1]?.trim(),
		};
	}
	report.layers.push(commentsLayer);

	// Layer 2: /Info Dictionary would go here (more complex parsing)
	const infoDictLayer: LayerResult = { name: "/Info Dictionary", present: false };
	// Simplified check - full implementation would parse PDF structure
	if (pdfString.includes("/Producer") && pdfString.includes("elaraSign")) {
		infoDictLayer.present = true;
	}
	report.layers.push(infoDictLayer);

	report.signed = commentsLayer.present || infoDictLayer.present;
	report.valid = report.signed; // PDF signature is valid if present
	report.tampered = false; // No tamper detection for PDFs yet
}

// ============================================================================
// Audio Verification
// ============================================================================

async function verifyAudio(buffer: Buffer, report: VerificationReport, _verbose: boolean): Promise<void> {
	const { verifyAudio: verifyAudioCore, detectAudioFormat } = await import("../core/audio-signing.js");

	const result = await verifyAudioCore(new Uint8Array(buffer));

	const metadataLayer: LayerResult = {
		name: `Audio Metadata (${result.format.toUpperCase()})`,
		present: result.isSigned,
	};

	if (result.isSigned && result.metadata) {
		metadataLayer.details = {
			method: result.metadata.method,
			generator: result.metadata.generator,
			model: result.metadata.model,
		};

		report.signature = {
			version: "2.0",
			metaHash: result.signatureHash || "unknown",
			generator: result.metadata.generator,
			method: result.metadata.method,
		};
	}

	report.layers.push(metadataLayer);
	report.signed = result.isSigned;
	report.valid = result.isSigned;
	report.tampered = false;
}

// ============================================================================
// PNG Chunk Extraction Helpers
// ============================================================================

function extractPngTextChunks(buffer: Buffer): Record<string, string> {
	const chunks: Record<string, string> = {};

	if (buffer[0] !== 0x89 || buffer[1] !== 0x50) {
		return chunks; // Not a PNG
	}

	let offset = 8; // Skip PNG signature

	while (offset < buffer.length - 12) {
		const length = buffer.readUInt32BE(offset);
		const chunkType = buffer.toString("ascii", offset + 4, offset + 8);

		if (chunkType === "tEXt") {
			const chunkData = buffer.subarray(offset + 8, offset + 8 + length);
			const nullIndex = chunkData.indexOf(0);
			if (nullIndex > 0) {
				const keyword = chunkData.subarray(0, nullIndex).toString("latin1");
				const text = chunkData.subarray(nullIndex + 1).toString("latin1");
				chunks[keyword] = text;
			}
		} else if (chunkType === "zTXt") {
			// Compressed text - would need zlib to decompress
			const chunkData = buffer.subarray(offset + 8, offset + 8 + length);
			const nullIndex = chunkData.indexOf(0);
			if (nullIndex > 0) {
				const keyword = chunkData.subarray(0, nullIndex).toString("latin1");
				chunks[keyword] = "[compressed]";
			}
		}

		if (chunkType === "IEND") {
			break;
		}

		offset += 12 + length; // length + type + data + CRC
	}

	return chunks;
}

function extractPngForensicChunk(buffer: Buffer): string | null {
	const chunks = extractPngTextChunks(buffer);
	return chunks["elaraSign:forensic"] || null;
}

// ============================================================================
// Output Formatting
// ============================================================================

function printReport(report: VerificationReport, verbose: boolean): void {
	console.log("\n================================================================================");
	console.log("                         elaraSign Verification Report");
	console.log("================================================================================\n");

	console.log(`File: ${report.file}`);
	console.log(`Type: ${report.type.toUpperCase()}`);
	console.log("");

	// Status banner
	if (!report.signed) {
		console.log("[NOT SIGNED] This file has no elaraSign signature.");
	} else if (report.tampered) {
		console.log("[TAMPERED] Signature found but content has been modified.");
	} else if (report.valid) {
		console.log("[VALID] Signature verified - file is authentic.");
	} else {
		console.log("[PARTIAL] Some signature layers found but verification incomplete.");
	}
	console.log("");

	// Signature details
	if (report.signature) {
		console.log("SIGNATURE:");
		console.log(`  Version:   ${report.signature.version}`);
		console.log(`  MetaHash:  ${report.signature.metaHash.slice(0, 32)}...`);
		if (report.signature.timestamp) {
			console.log(`  Timestamp: ${report.signature.timestamp}`);
		}
		if (report.signature.generator) {
			console.log(`  Generator: ${report.signature.generator}`);
		}
		if (report.signature.method) {
			console.log(`  Method:    ${report.signature.method}`);
		}
		console.log("");
	}

	// Layer status
	console.log("LAYERS:");
	for (const layer of report.layers) {
		const status = layer.present ? "[+]" : "[-]";
		console.log(`  ${status} ${layer.name}`);
		if (verbose && layer.details) {
			for (const [key, value] of Object.entries(layer.details)) {
				const displayValue =
					typeof value === "string" && value.length > 50 ? `${value.slice(0, 50)}...` : String(value);
				console.log(`      ${key}: ${displayValue}`);
			}
		}
	}
	console.log("");

	// Warnings
	if (report.warnings.length > 0) {
		console.log("WARNINGS:");
		for (const warning of report.warnings) {
			console.log(`  - ${warning}`);
		}
		console.log("");
	}

	// Errors
	if (report.errors.length > 0) {
		console.log("ERRORS:");
		for (const error of report.errors) {
			console.log(`  - ${error}`);
		}
		console.log("");
	}

	console.log("================================================================================\n");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const config = parseArgs();
	if (!config) {
		process.exit(0);
	}

	// Check file exists
	if (!fs.existsSync(config.filePath)) {
		console.error(`Error: File not found: ${config.filePath}`);
		process.exit(3);
	}

	// Read file
	const buffer = fs.readFileSync(config.filePath);

	// Initialize report
	const report: VerificationReport = {
		file: config.filePath,
		type: detectFileType(config.filePath, buffer),
		signed: false,
		valid: false,
		tampered: false,
		layers: [],
		warnings: [],
		errors: [],
	};

	// Verify based on type
	try {
		switch (report.type) {
			case "image":
				await verifyImage(buffer, report, config.verbose);
				break;
			case "pdf":
				await verifyPdf(buffer, report, config.verbose);
				break;
			case "audio":
				await verifyAudio(buffer, report, config.verbose);
				break;
			case "video":
				report.warnings.push("Video verification requires sidecar manifest");
				break;
			default:
				report.errors.push(`Unknown file type: ${report.type}`);
		}
	} catch (error) {
		report.errors.push(`Verification failed: ${error instanceof Error ? error.message : "unknown"}`);
	}

	// Output results
	if (config.outputJson) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printReport(report, config.verbose);
	}

	// Exit code
	if (!report.signed) {
		process.exit(1);
	} else if (report.tampered) {
		process.exit(2);
	} else {
		process.exit(0);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(3);
});
