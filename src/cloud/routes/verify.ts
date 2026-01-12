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

import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { decryptAccountability, isValidMasterKey } from "../../core/forensic-crypto.js";
import { hasElaraSignature, readSignature, verifyImageContent } from "../../core/signing-core.js";
import { extractSpreadSpectrum } from "../../core/spread-spectrum.js";
import { extractForensicPayload, verifyPdfSignature } from "./sign.js";

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
			const pdfResult = verifyPdfSignature(buffer);

			if (!pdfResult.signed) {
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
					version: pdfResult.version,
					metaHash: pdfResult.metaHash,
					generator: pdfResult.generator,
					timestamp: pdfResult.timestamp,
				},
				message: "elaraSign signature found in PDF",
			});
		}

		// Handle images via sharp
		const image = sharp(buffer);
		const imageMetadata = await image.metadata();
		const { width, height } = imageMetadata;

		if (!width || !height) {
			return res.status(400).json({ error: "Could not read image dimensions" });
		}

		// Get raw RGBA pixel data
		const rawBuffer = await image.ensureAlpha().raw().toBuffer();

		const imageData = new Uint8ClampedArray(rawBuffer);

		// Quick check for LSB signature
		const hasSig = hasElaraSignature(imageData, width, height);

		if (!hasSig) {
			// No LSB signature found - but check for spread spectrum watermark
			// This allows us to still identify images that were screenshotted/compressed
			// Note: We need the metaHash to extract, which we don't have without the LSB sig
			// So we return a hint about what might have happened

			return res.json({
				type: "image",
				format: mimetype,
				signed: false,
				message: "No elaraSign signature detected",
				note:
					mimetype === "image/jpeg"
						? "JPEG compression may have degraded the LSB signature. If forensic accountability was enabled, spread spectrum watermark may still be recoverable with the metaHash."
						: "If this image was screenshotted or re-encoded, the LSB signature may be lost. Spread spectrum watermark may still be present.",
				hint: "Operator can attempt forensic recovery if metaHash is known from another source.",
			});
		}

		// Read signature details
		const sigInfo = readSignature(imageData, width, height);

		// Verify integrity
		const verification = await verifyImageContent(imageData, width, height);

		// Try to extract spread spectrum watermark using metaHash as seed
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
			dimensions: { width, height },
			// Watermark layer status
			layers: {
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
