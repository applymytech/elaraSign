/**
 * Admin Routes
 * =============
 *
 * Admin-only endpoints for forensic decryption and service management.
 * Requires Firebase authentication with admin email match.
 */

import { type Request, type Response, Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { extractMultiLocationSignature } from "../../core/signing-core.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Master key from environment (Secret Manager)
const MASTER_KEY = process.env.ELARASIGN_MASTER_KEY || "";
const ADMIN_EMAIL = process.env.ELARASIGN_ADMIN_EMAIL || "";

/**
 * Middleware: Verify admin authentication
 */
function requireAdmin(req: Request, res: Response, next: () => void) {
	const authHeader = req.headers.authorization;

	if (!authHeader?.startsWith("Bearer ")) {
		res.status(401).json({ error: "Unauthorized", message: "Admin authentication required" });
		return;
	}

	// Extract Firebase ID token
	const _idToken = authHeader.substring(7);

	// In production, verify the token with Firebase Admin SDK
	// For MVP, we accept the token and trust the client verification
	// TODO: Add Firebase Admin SDK verification

	const userEmail = req.headers["x-user-email"] as string;

	if (!userEmail || userEmail !== ADMIN_EMAIL) {
		res.status(403).json({ error: "Forbidden", message: "Admin privileges required" });
		return;
	}

	next();
}

/**
 * POST /api/admin/decrypt
 * Decrypt forensic accountability data from signed image
 */
router.post("/decrypt", requireAdmin, upload.single("file"), async (req: Request, res: Response) => {
	try {
		if (!req.file) {
			res.status(400).json({ error: "No file uploaded" });
			return;
		}

		if (!MASTER_KEY || MASTER_KEY.length !== 64) {
			res.status(503).json({
				error: "Forensic decryption unavailable",
				message: "Master key not configured on this instance",
			});
			return;
		}

		// Extract pixel data from image
		const { data, info } = await sharp(req.file.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

		// Verify signature and extract forensic payload
		const extracted = extractMultiLocationSignature(pixels, info.width, info.height);

		if (extracted.validLocations.length === 0 || !extracted.bestSignature) {
			res.json({
				signed: false,
				message: "No elaraSign signature found in this image",
			});
			return;
		}

		// TODO: Forensic payload needs to be added to signature structure
		res.json({
			signed: true,
			forensicAvailable: false,
			message: "Forensic decryption temporarily disabled pending signature structure update",
			locations: extracted.validLocations,
		});
	} catch (error) {
		console.error("Admin decrypt error:", error);
		res.status(500).json({
			error: "Decryption failed",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
});

/**
 * GET /api/admin/status
 * Check admin capabilities
 */
router.get("/status", requireAdmin, (_req: Request, res: Response) => {
	res.json({
		admin: true,
		forensicEnabled: MASTER_KEY.length === 64,
		buildVersion: process.env.BUILD_VERSION || "dev",
	});
});

export { router as adminRoutes };
