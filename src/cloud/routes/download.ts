/**
 * Download Routes - GET /api/download/:id
 *
 * Downloads signed file + sidecar as a ZIP bundle.
 * Ensures provenance data always travels with the content.
 *
 * Bundle contents:
 * - image-signed.png (or .jpg, etc.) - The signed image with steganographic watermark
 * - image-sidecar.json - Human/machine readable provenance data
 * - README.txt - Instructions for verification
 */

import archiver from "archiver";
import { Router } from "express";
import { deleteSession, getSession, markDownloaded } from "../storage/session-manager.js";

const router = Router();

/**
 * Generate README content for the bundle
 */
function generateReadme(filename: string, sidecarName: string, metaHash: string): string {
	return `elaraSign Content Provenance Bundle
=====================================

This bundle contains a signed file with embedded provenance metadata.

CONTENTS:
- ${filename} - Signed content with steganographic watermark
- ${sidecarName} - Machine-readable provenance data (JSON)
- README.txt - This file

VERIFICATION:
1. Visit https://sign.openelara.org
2. Click "Verify" tab
3. Upload the image file
4. The system will read the embedded watermark and verify authenticity

WHAT'S IN THE SIDECAR:
- Generation method (AI/Human/Mixed)
- Generator tool and model used
- Signing timestamp
- Content hash (SHA-256)
- Meta hash: ${metaHash}

The same data is embedded invisibly in the image pixels (survives metadata stripping).
The sidecar provides human-readable access to this information.

LEGAL:
This provenance record was created at the time of signing.
The embedded watermark cannot be removed without visibly damaging the image.

Learn more: https://sign.openelara.org
`;
}

router.get("/download/:sessionId", async (req, res) => {
	try {
		const { sessionId } = req.params;
		const format = req.query.format as string; // 'zip' (default), 'image', 'sidecar'
		const session = await getSession(sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found or expired" });
		}

		// Mark as downloaded (triggers cleanup)
		await markDownloaded(sessionId);

		// Determine content type and extension
		const mimeType = session.mimeType || "image/png";
		const ext =
			mimeType === "application/pdf"
				? "pdf"
				: mimeType === "image/jpeg"
					? "jpg"
					: mimeType === "image/webp"
						? "webp"
						: mimeType === "image/tiff"
							? "tiff"
							: // Audio formats
								mimeType === "audio/mpeg"
								? "mp3"
								: mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave"
									? "wav"
									: mimeType === "audio/flac"
										? "flac"
										: mimeType === "audio/ogg"
											? "ogg"
											: mimeType === "audio/mp4" || mimeType === "audio/x-m4a"
												? "m4a"
												: // Video formats
													mimeType === "video/mp4"
													? "mp4"
													: mimeType === "video/webm"
														? "webm"
														: mimeType === "video/x-matroska"
															? "mkv"
															: mimeType === "video/quicktime"
																? "mov"
																: "png";

		// Determine content category for naming
		const _contentType = mimeType.startsWith("audio/")
			? "audio"
			: mimeType.startsWith("video/")
				? "video"
				: mimeType === "application/pdf"
					? "document"
					: "image";

		const baseName = session.originalName.replace(/\.[^.]+$/, "");
		const contentFilename = `${baseName}-signed.${ext}`;
		const sidecarFilename = `${baseName}-sidecar.json`;
		const bundleFilename = `${baseName}-elarasign-bundle.zip`;

		// Individual file downloads (for backwards compatibility)
		if (format === "image") {
			res.setHeader("Content-Type", mimeType);
			res.setHeader("Content-Disposition", `attachment; filename="${contentFilename}"`);
			res.setHeader("X-Elara-Signature", session.signature.metaHash);
			return res.send(session.signedImage);
		}

		if (format === "sidecar") {
			res.setHeader("Content-Type", "application/json");
			res.setHeader("Content-Disposition", `attachment; filename="${sidecarFilename}"`);
			return res.json(session.sidecar);
		}

		// Default: ZIP bundle with everything
		res.setHeader("Content-Type", "application/zip");
		res.setHeader("Content-Disposition", `attachment; filename="${bundleFilename}"`);
		res.setHeader("X-Elara-Signature", session.signature.metaHash);

		const archive = archiver("zip", { zlib: { level: 9 } });

		archive.on("error", (err) => {
			console.error("Archive error:", err);
			if (!res.headersSent) {
				res.status(500).json({ error: "Failed to create bundle" });
			}
		});

		// Pipe archive to response
		archive.pipe(res);

		// Add signed content
		archive.append(session.signedImage, { name: contentFilename });

		// Add sidecar JSON (pretty printed for readability)
		archive.append(JSON.stringify(session.sidecar, null, 2), { name: sidecarFilename });

		// Add README
		const readme = generateReadme(contentFilename, sidecarFilename, session.signature.metaHash);
		archive.append(readme, { name: "README.txt" });

		// Finalize
		await archive.finalize();

		// Schedule deletion
		setTimeout(() => deleteSession(sessionId), 60000);
	} catch (error) {
		console.error("Download error:", error);
		if (!res.headersSent) {
			return res.status(500).json({ error: "Internal server error" });
		}
	}
});

// Legacy sidecar endpoint (kept for backwards compatibility)
router.get("/sidecar/:sessionId", async (req, res) => {
	try {
		const { sessionId } = req.params;
		const session = await getSession(sessionId);

		if (!session) {
			return res.status(404).json({ error: "Session not found or expired" });
		}

		const sidecarFilename = session.originalName.replace(/\.[^.]+$/, "-sidecar.json");

		res.setHeader("Content-Type", "application/json");
		res.setHeader("Content-Disposition", `attachment; filename="${sidecarFilename}"`);

		return res.json(session.sidecar);
	} catch (error) {
		console.error("Sidecar error:", error);
		return res.status(500).json({ error: "Internal server error" });
	}
});

export { router as downloadRoutes };
