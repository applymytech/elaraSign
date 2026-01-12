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
 * Generate README content for the bundle (content-type aware)
 */
function generateReadme(
	filename: string,
	sidecarName: string,
	metaHash: string,
	contentType: "image" | "document" | "audio" | "video",
): string {
	const isExperimental = contentType !== "image";
	const experimentalWarning = isExperimental
		? `
⚠️  EXPERIMENTAL: ${contentType.toUpperCase()} SIGNING
=============================================
${
	contentType === "document"
		? `PDF signing embeds elaraSign metadata in the file structure.
This is NOT a PKCS#7 digital signature (Adobe/Windows won't show a signature banner).
Industry-standard PDF digital signatures are planned for a future version.`
		: ""
}
${
	contentType === "audio"
		? `Audio signing embeds metadata in ID3/INFO tags.
This is surface metadata only (can be stripped).
Robust audio watermarking is planned for a future version.`
		: ""
}
${
	contentType === "video"
		? `Video signing currently uses a sidecar manifest approach.
The video file itself is not modified.
Full video watermarking is planned for a future version.`
		: ""
}

`
		: "";

	const verificationInstructions =
		contentType === "image"
			? `VERIFICATION:
1. Visit https://sign.openelara.org
2. Click "Verify" tab
3. Upload the image file
4. The system will read the embedded watermark and verify authenticity

The same data is embedded invisibly in the image pixels (survives metadata stripping).
The sidecar provides human-readable access to this information.`
			: contentType === "document"
				? `VERIFICATION:
1. Visit https://sign.openelara.org
2. Click "Verify" tab  
3. Upload the PDF file
4. elaraSign will verify its own metadata

NOTE: Standard PDF viewers (Adobe, Windows) won't show this signature.
Only elaraSign-aware tools can verify this metadata.`
				: `VERIFICATION:
1. Visit https://sign.openelara.org
2. Upload the ${contentType} file
3. elaraSign will check for embedded metadata`;

	return `elaraSign Content Provenance Bundle
=====================================
${experimentalWarning}
This bundle contains a signed file with embedded provenance metadata.

CONTENTS:
- ${filename} - Signed content ${contentType === "image" ? "with steganographic watermark" : "with embedded metadata"}
- ${sidecarName} - Machine-readable provenance data (JSON)
- README.txt - This file

${verificationInstructions}

WHAT'S IN THE SIDECAR:
- Content type: ${contentType}
- Generation method (AI/Human/Mixed)
- Generator tool and model used
- Signing timestamp
- Content hash (SHA-256)
- Meta hash: ${metaHash}

ABOUT ELARASIGN:
elaraSign is a sovereign, open-source content provenance system.
It's experimental software - use at your own discretion.

Source code: https://github.com/openelara/elara-sign
"Transparency is not optional"

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

		// Determine content category for naming and README
		const contentCategory: "image" | "document" | "audio" | "video" = mimeType.startsWith("audio/")
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

		// Add README (content-type aware)
		const readme = generateReadme(contentFilename, sidecarFilename, session.signature.metaHash, contentCategory);
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
