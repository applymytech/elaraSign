/**
 * Sign Route - POST /api/sign
 *
 * HYBRID SIGNATURE STRATEGY (4 LAYERS):
 * =====================================
 *
 * 1. "Billboard" (Public) - Standard EXIF/IPTC/XMP + PNG tEXt metadata
 *    - Visible in Windows File Properties → Details
 *    - Readable by Adobe, ExifTool, standard image viewers
 *    - Easy to strip but provides trust signal to legitimate users
 *
 * 2. "DNA" (Internal) - LSB steganographic embedding via signing-core.ts
 *    - Hidden in LSB blue channel, 5 locations, maximum crop-resilience
 *    - Survives lossless operations only
 *    - Our sovereign proof that only Elara tools can fully verify
 *
 * 3. "The Spread" (Robust) - DCT spread spectrum watermarking
 *    - Encrypted forensic data spread across frequency domain
 *    - SURVIVES: JPEG compression, screenshots, cropping, social media
 *    - This is the "trap" - predator can't escape even with screenshot
 *
 * 4. "Forensic Payload" - Encrypted accountability data
 *    - AES-256 encrypted with operator's master key
 *    - Only law enforcement / operator can decrypt
 *    - Contains: timestamp, IP, user fingerprint, platform
 */

import crypto from "node:crypto";
import zlib from "node:zlib";
import { type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { type AudioSigningMetadata, signAudio } from "../../core/audio-signing.js";
import { type AccountabilityData, encryptAccountability, PLATFORM_CODES } from "../../core/forensic-crypto.js";
import {
	hashIpAddress,
	type ProvenanceData,
	type SignerInfo,
	signPdfWithDigitalSignature,
} from "../../core/pdf-digital-signature.js";
import { buildWitnessMetadata, getServiceIdentity } from "../../core/service-identity.js";
import {
	createPromptHash,
	createUserFingerprint,
	type ElaraContentMetadata,
	sha256Hex,
	signImageContent,
} from "../../core/signing-core.js";
import { embedSpreadSpectrum, type SpreadSpectrumPayload } from "../../core/spread-spectrum.js";
import {
	buildPngTextChunks,
	generateSidecar,
	injectJpegExif,
	type StandardMetadataOptions,
} from "../../core/standard-metadata.js";
import { createVideoSidecar, type VideoSigningMetadata } from "../../core/video-signing.js";
import { createSession } from "../storage/session-manager.js";

// ============================================================================
// FORENSIC ACCOUNTABILITY CONFIGURATION
// ============================================================================

/**
 * Master key for forensic accountability.
 *
 * LIFECYCLE:
 * 1. Generate ONCE: node -e "require('crypto').randomBytes(32).toString('hex')"
 * 2. Store in Secret Manager: gcloud secrets create elarasign-master-key --data-file=-
 * 3. Bind to Cloud Run as env var (see cloudbuild.yaml)
 * 4. NEVER regenerate - same key forever (or old images become orphaned)
 * 5. Save key offline for "break glass" decryption
 *
 * If not set, forensic accountability is disabled (development mode).
 */
const FORENSIC_MASTER_KEY = process.env.ELARASIGN_MASTER_KEY || "";
const FORENSIC_ENABLED = FORENSIC_MASTER_KEY.length === 64;

/**
 * Extract client IP from request
 */
function getClientIP(req: Request): string {
	// Standard headers for proxied requests
	const forwarded = req.headers["x-forwarded-for"];
	if (forwarded) {
		const ips = typeof forwarded === "string" ? forwarded : forwarded[0];
		return ips.split(",")[0].trim();
	}
	return req.ip || req.socket.remoteAddress || "0.0.0.0";
}

/**
 * Convert IP string to bytes (IPv4 only, others get zeros)
 */
function ipToBytes(ip: string): Uint8Array {
	const bytes = new Uint8Array(4);
	const match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (match) {
		bytes[0] = Number.parseInt(match[1], 10);
		bytes[1] = Number.parseInt(match[2], 10);
		bytes[2] = Number.parseInt(match[3], 10);
		bytes[3] = Number.parseInt(match[4], 10);
	}
	return bytes;
}

const router = Router();

// ============================================================================
// PNG TEXT CHUNK INJECTION
// ============================================================================

/**
 * Calculate CRC32 for PNG chunk validation
 */
function crc32Png(data: Buffer): number {
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
 * Create a PNG tEXt chunk
 */
function createPngTextChunk(keyword: string, text: string): Buffer {
	const keywordBytes = Buffer.from(keyword, "latin1");
	const textBytes = Buffer.from(text, "latin1");
	const nullSeparator = Buffer.from([0]);

	const chunkData = Buffer.concat([keywordBytes, nullSeparator, textBytes]);
	const chunkType = Buffer.from("tEXt", "ascii");

	// Length (4 bytes) + Type (4 bytes) + Data + CRC (4 bytes)
	const length = Buffer.alloc(4);
	length.writeUInt32BE(chunkData.length, 0);

	const crcData = Buffer.concat([chunkType, chunkData]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32Png(crcData), 0);

	return Buffer.concat([length, chunkType, chunkData, crc]);
}

/**
 * Create a PNG zTXt chunk (compressed text - for longer data)
 */
function createPngZtxtChunk(keyword: string, text: string): Buffer {
	const keywordBytes = Buffer.from(keyword, "latin1");
	const nullSeparator = Buffer.from([0]);
	const compressionMethod = Buffer.from([0]); // 0 = deflate
	const compressedText = zlib.deflateSync(Buffer.from(text, "utf8"));

	const chunkData = Buffer.concat([keywordBytes, nullSeparator, compressionMethod, compressedText]);
	const chunkType = Buffer.from("zTXt", "ascii");

	const length = Buffer.alloc(4);
	length.writeUInt32BE(chunkData.length, 0);

	const crcData = Buffer.concat([chunkType, chunkData]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32Png(crcData), 0);

	return Buffer.concat([length, chunkType, chunkData, crc]);
}

/**
 * Inject tEXt and zTXt chunks into a PNG buffer
 * Inserts after IHDR chunk (required to be first after signature)
 */
function injectPngTextChunks(pngBuffer: Buffer, textChunks: Record<string, string>): Buffer {
	// PNG signature is 8 bytes
	const PNG_SIGNATURE_LENGTH = 8;

	// Find end of IHDR chunk (must be first chunk after signature)
	// IHDR is always 13 bytes of data, so chunk is: 4 (length) + 4 (type) + 13 (data) + 4 (crc) = 25 bytes
	const ihdrEnd = PNG_SIGNATURE_LENGTH + 25;

	// Build text chunks
	const chunks: Buffer[] = [];
	for (const [keyword, text] of Object.entries(textChunks)) {
		if (text.length > 1000) {
			// Use compressed chunk for long text
			chunks.push(createPngZtxtChunk(keyword, text));
		} else {
			chunks.push(createPngTextChunk(keyword, text));
		}
	}

	const textChunksBuffer = Buffer.concat(chunks);

	// Reconstruct PNG: signature + IHDR + text chunks + rest
	return Buffer.concat([pngBuffer.subarray(0, ihdrEnd), textChunksBuffer, pngBuffer.subarray(ihdrEnd)]);
}

// Accept common image formats, PDF, audio, and video
const ALLOWED_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/bmp",
	"image/tiff",
	"application/pdf",
	// Audio formats
	"audio/mpeg", // MP3
	"audio/wav", // WAV
	"audio/x-wav", // WAV (alternative)
	"audio/wave", // WAV (alternative)
	"audio/flac", // FLAC
	"audio/ogg", // OGG
	"audio/mp4", // M4A
	"audio/x-m4a", // M4A (alternative)
	// Video formats
	"video/mp4", // MP4
	"video/webm", // WebM
	"video/x-matroska", // MKV
	"video/quicktime", // MOV
];

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit (videos can be larger)
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_TYPES.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new Error(
					`Unsupported file type: ${file.mimetype}. Supported: PNG, JPG, WebP, GIF, BMP, TIFF, PDF, MP3, WAV, FLAC, MP4, WebM`,
				),
			);
		}
	},
});

/**
 * Wrapper to handle multer errors properly (return 400, not 500)
 */
function handleUpload(req: Request, res: Response, next: NextFunction) {
	upload.single("file")(req, res, (err: unknown) => {
		if (err) {
			// Multer error (file type, size, etc.) - return 400, not 500
			const message = err instanceof Error ? err.message : "File upload error";
			return res.status(400).json({ error: message });
		}
		next();
	});
}

/**
 * Create metadata object with proper required fields for v2.0
 */
async function buildMetadata(
	contentBuffer: Buffer,
	options: {
		generator?: string;
		model?: string;
		prompt?: string;
		userId?: string;
		seed?: number;
		creatorName?: string;
		creatorEmail?: string;
		contentType?: "image" | "document" | "audio" | "video";
	},
): Promise<ElaraContentMetadata> {
	const contentHash = await sha256Hex(contentBuffer);
	const userFingerprint = options.userId
		? await createUserFingerprint(options.userId)
		: await sha256Hex(`elara:anonymous:${Date.now()}`);
	const promptHash = options.prompt ? await createPromptHash(options.prompt) : await sha256Hex("elara:no-prompt");

	// Build creator string with optional contact
	let creatorInfo = options.creatorName || "";
	if (options.creatorEmail) {
		creatorInfo = creatorInfo ? `${creatorInfo} <${options.creatorEmail}>` : options.creatorEmail;
	}

	// Get service deployment timestamp for uniqueness and accountability
	let serviceDeployedAt: string | undefined;
	try {
		const identity = getServiceIdentity();
		serviceDeployedAt = identity.deploy.deployedAt;
	} catch {
		serviceDeployedAt = undefined;
	}

	return {
		signatureVersion: "3.0",
		generator: options.generator || "elara.sign.cloud",
		generatedAt: new Date().toISOString(),
		userFingerprint,
		keyFingerprint: "cloud-public", // Cloud service uses a public key identifier
		contentType: options.contentType || "image",
		contentHash,
		characterId: "elara-sign-service",
		modelUsed: options.model || "unknown",
		promptHash,
		seed: options.seed,
		// Store creator info in a custom field (will be hashed into signature)
		creatorInfo: creatorInfo || undefined,
		// Include service deployment timestamp for build-specific uniqueness
		serviceDeployedAt,
	};
}

/**
 * Verify if a PDF has elaraSign signature
 */
function verifyPdfSignature(pdfBuffer: Buffer): {
	signed: boolean;
	metaHash?: string;
	version?: string;
	generator?: string;
	timestamp?: string;
} {
	const pdfString = pdfBuffer.toString("latin1");

	if (!pdfString.includes("ELARA_SIGN_START")) {
		return { signed: false };
	}

	const metaHashMatch = pdfString.match(/%% MetaHash: ([a-f0-9]+)/);
	const versionMatch = pdfString.match(/%% Version: ([\d.]+)/);
	const generatorMatch = pdfString.match(/%% Generator: ([^\n]+)/);
	const timestampMatch = pdfString.match(/%% Timestamp: ([^\n]+)/);

	return {
		signed: true,
		metaHash: metaHashMatch?.[1],
		version: versionMatch?.[1],
		generator: generatorMatch?.[1]?.trim(),
		timestamp: timestampMatch?.[1]?.trim(),
	};
}

/**
 * Extract forensic payload from PNG tEXt chunks
 * Returns the base64-encoded encrypted forensic data, or null if not found
 */
function extractForensicPayload(imageBuffer: Buffer): string | null {
	// Check PNG signature
	const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (!imageBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
		return null; // Not a PNG
	}

	let offset = 8; // Skip PNG signature

	while (offset < imageBuffer.length) {
		// Read chunk length (4 bytes, big-endian)
		const length = imageBuffer.readUInt32BE(offset);
		offset += 4;

		// Read chunk type (4 bytes)
		const chunkType = imageBuffer.subarray(offset, offset + 4).toString("ascii");
		offset += 4;

		// Read chunk data
		const chunkData = imageBuffer.subarray(offset, offset + length);
		offset += length;

		// Skip CRC (4 bytes)
		offset += 4;

		// Check for our forensic chunk
		if (chunkType === "tEXt") {
			// tEXt format: keyword + null + text
			const nullIndex = chunkData.indexOf(0);
			if (nullIndex > 0) {
				const keyword = chunkData.subarray(0, nullIndex).toString("latin1");
				const text = chunkData.subarray(nullIndex + 1).toString("latin1");

				if (keyword === "elaraSign:forensic") {
					return text;
				}
			}
		}

		// Stop at IEND
		if (chunkType === "IEND") {
			break;
		}
	}

	return null;
}

router.post("/sign", handleUpload, async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No file provided" });
		}

		const { mimetype, buffer, originalname } = req.file;
		const outputFormat = req.body.outputFormat || "same"; // 'same' or 'png'

		// Parse generation method (ai/human/mixed/unknown) - defaults to 'ai'
		const generationMethod = (["ai", "human", "mixed", "unknown"] as const).includes(req.body.method)
			? req.body.method
			: "ai";

		// Determine content type from mimetype
		const contentType: "image" | "document" | "audio" | "video" =
			mimetype === "application/pdf"
				? "document"
				: mimetype.startsWith("audio/")
					? "audio"
					: mimetype.startsWith("video/")
						? "video"
						: "image";

		// Build metadata with proper required fields
		const metadata = await buildMetadata(buffer, {
			generator: req.body.generator,
			model: req.body.model,
			prompt: req.body.prompt,
			userId: req.body.userId,
			seed: req.body.seed ? Number.parseInt(req.body.seed, 10) : undefined,
			creatorName: req.body.creatorName,
			creatorEmail: req.body.creatorEmail,
			contentType,
		});

		// Build creator string for standard metadata
		let creatorDisplay = req.body.creatorName || metadata.generator;
		if (req.body.creatorEmail && req.body.creatorName) {
			creatorDisplay = `${req.body.creatorName}`;
		}

		// Include service deployment timestamp in generator for accountability
		const deployTimestamp = metadata.serviceDeployedAt
			? ` (deployed ${new Date(metadata.serviceDeployedAt).toISOString()})`
			: "";
		const fullGenerator = `${metadata.generator}${deployTimestamp}`;

		// Standard metadata options for the "Passport" layer (visible in Windows Properties, etc.)
		const standardMetaOptions: StandardMetadataOptions = {
			generator: fullGenerator,
			model: metadata.modelUsed,
			generationMethod: generationMethod,
			timestamp: new Date().toISOString(),
			metaHash: "", // Will be set after signing
			creator: creatorDisplay,
		};

		// Handle PDF separately - with digital signature support
		if (mimetype === "application/pdf") {
			// Build signer info from request
			// For public cloud: use provided name/email or defaults
			// For integration: apps provide KYC-verified user data
			const signerInfo: SignerInfo = {
				name: req.body.signerName || req.body.creatorName || "Anonymous Signer",
				email: req.body.signerEmail || req.body.creatorEmail || "anonymous@elarasign.org",
				reason: req.body.reason || `${generationMethod.toUpperCase()} content - Provenance record`,
				location: req.body.location || "elaraSign Cloud Service",
				contactInfo: req.body.signerEmail || req.body.creatorEmail,
			};

			// Build provenance data
			const provenanceData: ProvenanceData = {
				method: generationMethod,
				generator: metadata.generator,
				model: metadata.modelUsed,
				characterId: metadata.characterId,
				userFingerprint: metadata.userFingerprint,
				ipHash: hashIpAddress(getClientIP(req)),
				platformCode: "elara-cloud",
				userCode: req.body.userCode, // Optional user identification code
			};

			// Get service identity for PKCS#7 signing (if available)
			let serviceIdentity: ReturnType<typeof getServiceIdentity> | null = null;
			try {
				serviceIdentity = getServiceIdentity();
			} catch {
				serviceIdentity = null;
			}

			// Build witness metadata
			const witnessMetadata = serviceIdentity ? buildWitnessMetadata() : undefined;

			// Sign PDF with digital signature
			const result = await signPdfWithDigitalSignature(new Uint8Array(buffer), {
				signer: signerInfo,
				provenance: provenanceData,
				// Use service certificate for PKCS#7 if available
				p12Certificate: serviceIdentity?.p12Certificate,
				p12Password: serviceIdentity?.p12Password,
			});

			const session = await createSession({
				signedImage: Buffer.from(result.signedPdf),
				originalName: originalname,
				signature: {
					metaHash: result.metaHash,
					locations: ["pdf-info", "pdf-keywords", ...(result.hasPkcs7Signature ? ["pkcs7"] : [])],
					timestamp: new Date().toISOString(),
				},
				metadata: {
					...metadata,
					signer: signerInfo,
					provenance: provenanceData,
					witness: witnessMetadata,
				},
				mimeType: "application/pdf",
			});

			return res.json({
				success: true,
				type: "pdf",
				sessionId: session.id,
				downloadUrl: `/api/download/${session.id}`,
				signature: {
					metaHash: result.metaHash,
					contentHash: result.contentHash,
					locations: ["pdf-info", "pdf-keywords", ...(result.hasPkcs7Signature ? ["pkcs7"] : [])],
					version: "2.0",
					hasPkcs7: result.hasPkcs7Signature,
					signer: {
						name: signerInfo.name,
						email: signerInfo.email,
					},
					witness: witnessMetadata?.service,
				},
				expiresIn: "10 minutes",
			});
		}

		// Handle audio files - simple surface metadata (Windows Explorer visible)
		if (mimetype.startsWith("audio/")) {
			// Hash the user ID for privacy
			const userFingerprint = req.body.userId
				? crypto.createHash("sha256").update(req.body.userId).digest("hex").slice(0, 16)
				: crypto.createHash("sha256").update("anonymous").digest("hex").slice(0, 16);

			const audioMetadata: AudioSigningMetadata = {
				method: generationMethod,
				generator: metadata.generator,
				model: metadata.modelUsed,
				generatedAt: new Date().toISOString(),
				userFingerprint,
				originalTitle: req.body.title,
				originalArtist: req.body.creatorName || creatorDisplay,
				voiceModel: req.body.model,
				promptHash: req.body.prompt
					? crypto.createHash("sha256").update(req.body.prompt).digest("hex").slice(0, 16)
					: undefined,
			};

			// Convert Buffer to Uint8Array
			const audioBytes = new Uint8Array(buffer);
			const result = await signAudio(audioBytes, audioMetadata);

			const session = await createSession({
				signedImage: Buffer.from(result.signedAudio),
				originalName: originalname,
				signature: {
					metaHash: result.metaHash,
					locations: [result.embeddingMethod],
					timestamp: new Date().toISOString(),
				},
				metadata,
				mimeType: mimetype,
			});

			return res.json({
				success: true,
				type: "audio",
				format: result.format,
				sessionId: session.id,
				downloadUrl: `/api/download/${session.id}`,
				signature: {
					metaHash: result.metaHash,
					contentHash: result.contentHash,
					embeddingMethod: result.embeddingMethod,
					version: "2.0",
				},
				expiresIn: "10 minutes",
			});
		}

		// Handle video files - sidecar manifest approach (simple, Windows visible)
		if (mimetype.startsWith("video/")) {
			// Hash the user ID for privacy
			const userFingerprint = req.body.userId
				? crypto.createHash("sha256").update(req.body.userId).digest("hex").slice(0, 16)
				: crypto.createHash("sha256").update("anonymous").digest("hex").slice(0, 16);

			const videoMetadata: VideoSigningMetadata = {
				method: generationMethod,
				generator: metadata.generator,
				model: metadata.modelUsed,
				generatedAt: new Date().toISOString(),
				userFingerprint,
				originalTitle: req.body.title || originalname,
				promptHash: req.body.prompt
					? crypto.createHash("sha256").update(req.body.prompt).digest("hex").slice(0, 16)
					: undefined,
			};

			// For videos, we just create a sidecar - we don't have ffprobe to read duration/resolution
			// Use placeholders that can be filled in client-side or via external tools
			const videoBytes = new Uint8Array(buffer);
			const sidecar = await createVideoSidecar(
				videoBytes,
				videoMetadata,
				req.body.duration ? Number.parseFloat(req.body.duration) : 0, // Client can provide
				req.body.width ? Number.parseInt(req.body.width, 10) : 0,
				req.body.height ? Number.parseInt(req.body.height, 10) : 0,
			);

			// Store both video and sidecar in session
			const session = await createSession({
				signedImage: buffer, // Original video unchanged
				originalName: originalname,
				signature: {
					metaHash: sidecar.metaHash,
					locations: ["sidecar-manifest"],
					timestamp: new Date().toISOString(),
				},
				metadata,
				mimeType: mimetype,
				sidecar: sidecar, // Include sidecar manifest
			});

			return res.json({
				success: true,
				type: "video",
				sessionId: session.id,
				downloadUrl: `/api/download/${session.id}`,
				sidecarUrl: `/api/download/${session.id}?format=sidecar`,
				signature: {
					metaHash: sidecar.metaHash,
					contentHash: sidecar.contentHash,
					signatureHash: sidecar.signatureHash,
					locations: ["sidecar-manifest"],
					version: "2.0",
				},
				sidecar: sidecar,
				expiresIn: "10 minutes",
			});
		}

		// Handle images - convert to raw pixels via sharp
		const image = sharp(buffer);
		const imageMetadata = await image.metadata();
		const { width, height } = imageMetadata;

		if (!width || !height) {
			return res.status(400).json({ error: "Could not read image dimensions" });
		}

		// Get raw RGBA pixel data
		const rawBuffer = await image.ensureAlpha().raw().toBuffer();

		const imageData = new Uint8ClampedArray(rawBuffer);

		// Sign the image (embeds steganographic signature in pixel data)
		const result = await signImageContent(imageData, width, height, metadata);

		// ========================================================================
		// FORENSIC ACCOUNTABILITY (if enabled)
		// ========================================================================
		let forensicPayload: string | undefined;
		let finalImageData = result.signedImageData;

		if (FORENSIC_ENABLED) {
			// Create accountability data for "break glass" scenarios
			const userFingerprintBytes = Buffer.from(
				metadata.userFingerprint.slice(0, 16), // First 16 hex chars = 8 bytes
				"hex",
			);

			const accountabilityData: AccountabilityData = {
				timestamp: Math.floor(Date.now() / 1000),
				userFingerprint: new Uint8Array(userFingerprintBytes),
				ipAddress: ipToBytes(getClientIP(req)),
				platformCode: PLATFORM_CODES["elara.sign.web"],
			};

			// Encrypt with master key (only operator can decrypt later)
			const encrypted = encryptAccountability(
				accountabilityData,
				FORENSIC_MASTER_KEY,
				result.metaHash, // Use metaHash as salt for uniqueness
			);

			// Base64 encode for storage in metadata
			forensicPayload = Buffer.from(encrypted).toString("base64");

			// ======================================================================
			// "THE SPREAD" - DCT Spread Spectrum Watermarking
			// ======================================================================
			// This embeds the SAME forensic data into the frequency domain
			// It survives: JPEG, screenshots, cropping, social media
			// The predator cannot escape even with a screenshot

			const spreadPayload: SpreadSpectrumPayload = {
				timestamp: accountabilityData.timestamp,
				ipBytes: accountabilityData.ipAddress,
				fingerprint: accountabilityData.userFingerprint,
				platformCode: accountabilityData.platformCode,
			};

			// Embed spread spectrum watermark (uses metaHash as unique seed)
			finalImageData = embedSpreadSpectrum(result.signedImageData, width, height, spreadPayload, result.metaHash);
		}

		// Determine output format
		let outputMime = mimetype;
		let outputBuffer: Buffer;
		let outputExt = originalname.split(".").pop() || "png";

		// Create sharp instance from signed raw pixel data (with spread spectrum if enabled)
		const signedImage = sharp(Buffer.from(finalImageData), {
			raw: { width, height, channels: 4 },
		});

		// PNG text chunks for metadata (PNG-specific, survives most processing)
		// Enhanced with standard metadata for the "Passport" layer
		const pngTextChunks = buildPngTextChunks({
			...standardMetaOptions,
			metaHash: result.metaHash,
		});

		// Add forensic payload to PNG chunks if enabled
		if (forensicPayload) {
			// Store encrypted accountability data (only operator can decrypt)
			pngTextChunks["elaraSign:forensic"] = forensicPayload;
		}

		if (outputFormat === "png" || mimetype === "image/png") {
			outputBuffer = await signedImage.png({ compressionLevel: 9 }).toBuffer();

			// Inject PNG tEXt chunks (this is what will show in Windows/tools)
			outputBuffer = injectPngTextChunks(outputBuffer, pngTextChunks);
			outputMime = "image/png";
			outputExt = "png";
		} else if (mimetype === "image/jpeg") {
			// JPEG output - inject EXIF/IPTC metadata for "Passport" layer
			// Note: JPEG is lossy - steganographic signature may degrade, warn user
			outputBuffer = await signedImage.jpeg({ quality: 100 }).toBuffer();

			// Inject standard EXIF metadata (shows in Windows Properties, Adobe, ExifTool)
			outputBuffer = injectJpegExif(outputBuffer, {
				...standardMetaOptions,
				metaHash: result.metaHash,
			});

			outputMime = "image/jpeg";
		} else if (mimetype === "image/webp") {
			outputBuffer = await signedImage.webp({ lossless: true }).toBuffer();
			outputMime = "image/webp";
		} else if (mimetype === "image/gif") {
			// GIF conversion - use PNG for signed output (GIF doesn't preserve well)
			outputBuffer = await signedImage.png().toBuffer();
			outputBuffer = injectPngTextChunks(outputBuffer, pngTextChunks);
			outputMime = "image/png";
			outputExt = "png";
		} else if (mimetype === "image/tiff") {
			outputBuffer = await signedImage.tiff().toBuffer();
			outputMime = "image/tiff";
		} else {
			// Default to PNG
			outputBuffer = await signedImage.png().toBuffer();
			outputBuffer = injectPngTextChunks(outputBuffer, pngTextChunks);
			outputMime = "image/png";
			outputExt = "png";
		}

		// Generate sidecar JSON for external verification
		const sidecar = generateSidecar({
			...standardMetaOptions,
			metaHash: result.metaHash,
			contentHash: metadata.contentHash,
			locations: result.locationsEmbedded,
			originalFilename: originalname,
		});

		// Create session for download
		// Strip any existing "-signed" suffix before adding a fresh one
		const baseName = originalname
			.replace(/\.[^.]+$/, "") // Remove extension
			.replace(/-signed$/i, ""); // Remove existing -signed suffix

		const session = await createSession({
			signedImage: outputBuffer,
			originalName: `${baseName}-signed.${outputExt}`,
			signature: {
				metaHash: result.metaHash,
				locations: result.locationsEmbedded,
				timestamp: new Date().toISOString(),
			},
			metadata,
			mimeType: outputMime,
			sidecar, // Include sidecar JSON for download
		});

		return res.json({
			success: true,
			type: "image",
			format: outputMime,
			sessionId: session.id,
			downloadUrl: `/api/download/${session.id}`,
			sidecarUrl: `/api/sidecar/${session.id}`,
			signature: {
				metaHash: result.metaHash,
				locations: result.locationsEmbedded,
				version: "2.0",
				method: generationMethod, // DNA embedded + Passport visible
			},
			dimensions: { width, height },
			metadata: {
				standardMetadata: true, // Indicates Passport layer was applied
				method: generationMethod,
				exifInjected: mimetype === "image/jpeg",
				pngChunksInjected: outputMime === "image/png",
			},
			warning:
				mimetype === "image/jpeg"
					? "JPEG is lossy - steganographic signature may degrade if image is re-saved. PNG recommended for perfect preservation."
					: undefined,
			expiresIn: "10 minutes",
		});
	} catch (error) {
		console.error("Sign error:", error);
		const message = error instanceof Error ? error.message : "Unknown error";
		return res.status(500).json({ error: message });
	}
});

// Export PDF verification for verify route
export { verifyPdfSignature, extractForensicPayload };
export { router as signRoutes };
