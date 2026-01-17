/**
 * Verify Route - POST /api/verify, POST /api/forensic-unlock
 *
 * Accepts any image or PDF file and verifies its elaraSign signature.
 *
 * VERIFICATION LAYERS:
 * 1. PNG tEXt chunks / EXIF metadata (Billboard - easily stripped)
 * 2. LSB steganographic signature (DNA - survives lossless only)
 * 3. DCT spread spectrum watermark (The Spread - survives JPEG/screenshots)
 *
 * The forensic-unlock endpoint allows operators with the master key
 * to decrypt accountability data embedded in signed images.
 */

import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { verifyAudio } from "../../core/audio-signing.js";
import { decryptAccountability, isValidMasterKey } from "../../core/forensic-crypto.js";
import { verifyPdf } from "../../core/pdf-signing.js";
import { hasElaraSignature, readSignature, verifyImageContent } from "../../core/signing-core.js";
import { extractSpreadSpectrum } from "../../core/spread-spectrum.js";
import {
	type BillboardMetadata,
	extractJpegElaraMetadata,
	extractPngElaraMetadata,
} from "../../core/standard-metadata.js";
import { extractForensicPayload } from "./sign.js";

const router = Router();

// Master key from Secret Manager (for validation)
const FORENSIC_MASTER_KEY = process.env.ELARASIGN_MASTER_KEY || "";
const FORENSIC_ENABLED = FORENSIC_MASTER_KEY.length === 64;

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
	limits: { fileSize: 50 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_TYPES.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error(`Unsupported file type: ${file.mimetype}`));
		}
	},
});

router.post("/verify", upload.single("file"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No file provided" });
		}

		const { mimetype, buffer } = req.file;

		// Handle PDF
		if (mimetype === "application/pdf") {
			const pdfResult = await verifyPdf(new Uint8Array(buffer));

			if (!pdfResult.isSigned) {
				return res.json({
					type: "pdf",
					signed: false,
					message: "No elaraSign signature detected in PDF",
				});
			}

			return res.json({
				type: "pdf",
				signed: true,
				verified: true, // PDF signatures are verified by presence (no pixel content hash)
				signature: {
					version: "2.0",
					metaHash: pdfResult.signatureHash,
					generator: pdfResult.metadata?.generator,
					timestamp: pdfResult.metadata?.generatedAt,
					contentHash: pdfResult.contentHash,
				},
				message: "elaraSign signature found in PDF",
			});
		}

		// Handle audio files
		if (mimetype.startsWith("audio/")) {
			const audioResult = await verifyAudio(new Uint8Array(buffer));

			if (!audioResult.isSigned) {
				return res.json({
					type: "audio",
					signed: false,
					message: "No elaraSign signature detected in audio file",
				});
			}

			// Compute content hash for consistency with signing
			const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

			return res.json({
				type: "audio",
				signed: true,
				verified: true,
				signature: {
					version: "2.0",
					metaHash: audioResult.signatureHash,
					generator: audioResult.metadata?.generator,
					timestamp: audioResult.metadata?.generatedAt,
					contentHash: contentHash,
				},
				message: "elaraSign signature found in audio file",
			});
		}

		// Handle video files (sidecar-based verification)
		if (mimetype.startsWith("video/")) {
			// For videos, we need the sidecar file to verify
			// For now, just check if it looks like it might be signed
			return res.json({
				type: "video",
				signed: false, // Videos require sidecar verification
				message: "Video verification requires sidecar JSON file. Use the sidecar validation feature.",
			});
		}

		// Handle images via sharp
		const image = sharp(buffer);
		const imageMetadata = await image.metadata();
		const { width, height, format } = imageMetadata;

		if (!width || !height) {
			return res.status(400).json({ error: "Could not read image dimensions" });
		}

		// =====================================================================
		// LAYER 1: Billboard (EXIF/PNG tEXt) - Human-readable metadata
		// =====================================================================
		let billboard: BillboardMetadata | null = null;

		if (mimetype === "image/jpeg" || format === "jpeg") {
			billboard = extractJpegElaraMetadata(buffer);
		} else if (mimetype === "image/png" || format === "png") {
			// Sharp returns PNG text chunks in metadata
			billboard = extractPngElaraMetadata(
				imageMetadata as {
					comments?: Array<{ keyword: string; text: string }>;
				},
			);
		}

		// Get raw RGBA pixel data for steganographic analysis
		const rawBuffer = await image.ensureAlpha().raw().toBuffer();

		const imageData = new Uint8ClampedArray(rawBuffer);

		// =====================================================================
		// LAYER 2: DNA (LSB Steganography) - Hidden signature
		// =====================================================================
		const hasSig = hasElaraSignature(imageData, width, height);

		if (!hasSig) {
			// No LSB signature found - but we might have billboard metadata!
			// This is important: image could have been re-encoded (JPEG) but still have EXIF

			if (billboard?.found) {
				// Billboard found but DNA missing - image was likely re-encoded
				return res.json({
					type: "image",
					format: mimetype,
					signed: true,
					verified: false,
					message: "elaraSign metadata found but hidden signature missing",
					note: "Image appears to have been re-encoded or processed, which removed the steganographic layer. The visible metadata layer remains.",
					billboard: {
						found: true,
						source: billboard.source,
						software: billboard.software,
						copyright: billboard.copyright,
						description: billboard.description,
						creator: billboard.creator,
						timestamp: billboard.timestamp,
						metaHash: billboard.metaHash,
						generationMethod: billboard.generationMethod,
						generator: billboard.generator,
						model: billboard.model,
					},
					layers: {
						billboard: true,
						lsb: false,
						spreadSpectrum: false,
					},
					hint: "The visible metadata can be easily stripped. For authoritative verification, use the original PNG file.",
				});
			}

			// Neither billboard nor DNA found
			return res.json({
				type: "image",
				format: mimetype,
				signed: false,
				message: "No elaraSign signature detected",
				note:
					mimetype === "image/jpeg"
						? "JPEG compression removes the hidden signature. If this was originally signed, try the original PNG."
						: "If this image was screenshotted or re-encoded, the signature may be lost.",
				billboard: { found: false },
				layers: {
					billboard: false,
					lsb: false,
					spreadSpectrum: false,
				},
				hint: "Operator can attempt forensic recovery if metaHash is known from another source.",
			});
		}

		// =====================================================================
		// LAYER 2 SUCCESS: Read full signature details
		// =====================================================================
		const sigInfo = readSignature(imageData, width, height);

		// Verify integrity (content hash check)
		const verification = await verifyImageContent(imageData, width, height);

		// =====================================================================
		// LAYER 3: The Spread (DCT Watermark) - Survives JPEG/screenshots
		// =====================================================================
		let spreadSpectrumFound = false;
		let spreadConfidence = 0;

		if (sigInfo.metaHash) {
			try {
				const spreadResult = extractSpreadSpectrum(imageData, width, height, sigInfo.metaHash);
				if (spreadResult) {
					spreadSpectrumFound = true;
					spreadConfidence = spreadResult.confidence;
				}
			} catch {
				// Spread spectrum extraction failed silently
			}
		}

		return res.json({
			type: "image",
			format: mimetype,
			signed: true,
			verified: verification.isValid,
			tampered: verification.tamperDetected,
			signature: {
				version: sigInfo.version,
				timestamp: sigInfo.timestamp,
				metaHash: sigInfo.metaHash,
				validLocations: sigInfo.validLocations,
			},
			// Billboard layer - human-readable metadata (EXIF/PNG tEXt)
			billboard: billboard?.found
				? {
						found: true,
						source: billboard.source,
						software: billboard.software,
						copyright: billboard.copyright,
						description: billboard.description,
						creator: billboard.creator,
						timestamp: billboard.timestamp,
						generationMethod: billboard.generationMethod,
						generator: billboard.generator,
						model: billboard.model,
					}
				: { found: false },
			dimensions: { width, height },
			// All signature layers status
			layers: {
				billboard: billboard?.found || false,
				lsb: true, // We got here, so LSB was found
				spreadSpectrum: spreadSpectrumFound,
				spreadConfidence: spreadSpectrumFound ? Math.round(spreadConfidence * 100) : undefined,
			},
			message: verification.isValid
				? "Signature valid - image has not been tampered with"
				: verification.tamperDetected
					? "WARNING: Image may have been tampered with"
					: "Signature found but could not verify integrity",
			// Indicate forensic data may be available (without revealing it)
			forensicAvailable: FORENSIC_ENABLED,
		});
	} catch (error) {
		console.error("Verify error:", error);
		const message = error instanceof Error ? error.message : "Unknown error";
		return res.status(500).json({ error: message });
	}
});

/**
 * Forensic Unlock Endpoint
 *
 * Allows operators with the master key to decrypt accountability data.
 * The key is validated against Secret Manager before attempting decryption.
 *
 * Flow:
 * 1. User uploads image + provides key
 * 2. Server validates key matches Secret Manager
 * 3. If valid, extract and decrypt forensic payload from PNG chunks
 * 4. Return decrypted accountability data
 */
router.post("/forensic-unlock", upload.single("file"), async (req, res) => {
	try {
		const providedKey = req.body.masterKey;

		// Validate key format
		if (!providedKey || !isValidMasterKey(providedKey)) {
			return res.status(400).json({
				error: "Invalid key format",
				message: "Master key must be 64 hexadecimal characters",
			});
		}

		// Validate key matches our Secret Manager key
		if (!FORENSIC_ENABLED) {
			return res.status(503).json({
				error: "Forensic system not configured",
				message: "This deployment does not have forensic accountability enabled",
			});
		}

		if (providedKey !== FORENSIC_MASTER_KEY) {
			// Don't reveal whether forensic is enabled or what the key is
			return res.status(403).json({
				error: "Invalid key",
				message: "The provided master key does not match",
			});
		}

		if (!req.file) {
			return res.status(400).json({ error: "No file provided" });
		}

		const { mimetype, buffer } = req.file;

		// Only images supported for forensic unlock (PNG chunks)
		if (!mimetype.startsWith("image/")) {
			return res.status(400).json({
				error: "Unsupported file type",
				message: "Forensic unlock only works with images",
			});
		}

		// Extract forensic payload from PNG chunks
		const forensicPayload = extractForensicPayload(buffer);

		if (!forensicPayload) {
			return res.json({
				success: false,
				message: "No forensic data found in this image",
				note: "Image may have been signed before forensic system was enabled, or metadata was stripped",
			});
		}

		// Decode base64 payload
		const encryptedBytes = new Uint8Array(Buffer.from(forensicPayload, "base64"));

		// Get signature metaHash for salt (need to verify image first)
		const image = sharp(buffer);
		const { width, height } = await image.metadata();

		if (!width || !height) {
			return res.status(400).json({ error: "Could not read image dimensions" });
		}

		const rawBuffer = await image.ensureAlpha().raw().toBuffer();
		const imageData = new Uint8ClampedArray(rawBuffer);
		const sigInfo = readSignature(imageData, width, height);

		// Decrypt with master key
		const decrypted = decryptAccountability(
			encryptedBytes,
			providedKey,
			sigInfo.metaHash, // Use metaHash as salt
		);

		if (!decrypted.valid) {
			return res.json({
				success: false,
				message: "Failed to decrypt forensic data",
				note: "Data may be corrupted or encrypted with a different key",
			});
		}

		// Return decrypted accountability data
		return res.json({
			success: true,
			message: "Forensic data decrypted successfully",
			forensicData: {
				timestamp: decrypted.timestamp.toISOString(),
				userFingerprint: decrypted.userFingerprint,
				ip: decrypted.ipAddress,
				platform: decrypted.platform,
			},
			signature: {
				metaHash: sigInfo.metaHash,
				version: sigInfo.version,
			},
			warning: "This data is for authorized use only. Misuse may violate privacy laws.",
		});
	} catch (error) {
		console.error("Forensic unlock error:", error);
		return res.status(500).json({ error: "Internal server error" });
	}
});

export { router as verifyRoutes };
