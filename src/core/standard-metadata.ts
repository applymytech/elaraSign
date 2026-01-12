/**
 * Standard Metadata Writer
 * ========================
 *
 * The "Passport" layer of our Hybrid Signature Strategy.
 *
 * While signing-core.ts handles the "DNA" (steganographic pixel embedding),
 * this module handles the "Passport" (standard metadata that normie tools see).
 *
 * When a user right-clicks a file in Windows → Properties → Details:
 * - They'll see "Copyright: Signed with elaraSign"
 * - They'll see "Authors: [generator]"
 * - They'll see "Comments: Content provenance verified"
 *
 * This uses EXIF/IPTC/XMP standards that are recognized by:
 * - Windows File Properties
 * - Adobe Photoshop/Acrobat
 * - ExifTool
 * - macOS Finder
 * - Most image viewers
 *
 * @author OpenElara Project
 * @license MIT
 */

// @ts-expect-error - piexifjs doesn't have TypeScript definitions
import piexif from "piexifjs";

// ============================================================================
// TYPES
// ============================================================================

export interface StandardMetadataOptions {
	/** Generator/tool that created the content */
	generator: string;

	/** Generation method: ai, human, mixed, unknown */
	generationMethod: "ai" | "human" | "mixed" | "unknown";

	/** Model used (for AI content) */
	model?: string;

	/** elaraSign meta hash (links to our DNA) */
	metaHash: string;

	/** Timestamp of signing */
	timestamp: string;

	/** Optional creator name */
	creator?: string;

	/** Optional copyright text */
	copyright?: string;

	/** Optional description */
	description?: string;
}

export interface SidecarMetadata {
	/** elaraSign provenance data */
	elaraSign: {
		version: string;
		metaHash: string;
		contentHash: string;
		locations: string[];
		timestamp: string;
	};

	/** Generation information */
	generation: {
		method: "ai" | "human" | "mixed" | "unknown";
		generator: string;
		model?: string;
		timestamp: string;
	};

	/** Standard fields for interoperability */
	standard: {
		creator: string;
		copyright: string;
		software: string;
		description: string;
	};
}

// ============================================================================
// GENERATION METHOD LABELS
// ============================================================================

const GENERATION_LABELS = {
	ai: "AI-Generated Content",
	human: "Human-Created Content",
	mixed: "AI-Assisted Content",
	unknown: "Unknown Origin",
} as const;

// ============================================================================
// EXIF/IPTC METADATA FOR JPEG
// ============================================================================

/**
 * Inject EXIF metadata into a JPEG buffer
 * This makes metadata visible in Windows Properties → Details
 */
export function injectJpegExif(jpegBuffer: Buffer, options: StandardMetadataOptions): Buffer {
	try {
		// Convert buffer to base64 data URL for piexifjs
		const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;

		// Build EXIF data structure
		const zeroth: Record<number, string | number> = {};
		const exif: Record<number, string | number> = {};

		// EXIF IFD0 (main image tags)
		zeroth[piexif.ImageIFD.Software] = "elaraSign v2.0";
		zeroth[piexif.ImageIFD.Artist] = options.creator || options.generator;
		zeroth[piexif.ImageIFD.Copyright] =
			options.copyright ||
			`Signed with elaraSign | ${GENERATION_LABELS[options.generationMethod]} | Hash: ${options.metaHash.substring(0, 16)}...`;
		zeroth[piexif.ImageIFD.ImageDescription] =
			options.description ||
			`${GENERATION_LABELS[options.generationMethod]}. Generator: ${options.generator}. Verified by elaraSign.`;

		// EXIF SubIFD
		exif[piexif.ExifIFD.DateTimeOriginal] = formatExifDate(options.timestamp);
		exif[piexif.ExifIFD.UserComment] = `elaraSign:${options.metaHash}`;

		const exifObj = {
			"0th": zeroth,
			Exif: exif,
		};

		// Dump to binary and insert
		const exifBytes = piexif.dump(exifObj);
		const newDataUrl = piexif.insert(exifBytes, dataUrl);

		// Convert back to buffer
		const base64Data = newDataUrl.replace(/^data:image\/jpeg;base64,/, "");
		return Buffer.from(base64Data, "base64");
	} catch (error) {
		console.warn("Failed to inject EXIF metadata:", error);
		// Return original if EXIF injection fails
		return jpegBuffer;
	}
}

/**
 * Read existing EXIF data from JPEG
 */
export function readJpegExif(jpegBuffer: Buffer): Record<string, unknown> | null {
	try {
		const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
		const exifObj = piexif.load(dataUrl);
		return exifObj;
	} catch {
		return null;
	}
}

// ============================================================================
// PNG METADATA (via tEXt/iTXt chunks)
// ============================================================================

/**
 * Build standard PNG text chunks that show in file properties
 * These are injected via the existing injectPngTextChunks function
 */
export function buildPngTextChunks(options: StandardMetadataOptions): Record<string, string> {
	return {
		// Standard PNG text keywords (recognized by most tools)
		Software: "elaraSign v2.0",
		Author: options.creator || options.generator,
		Copyright: options.copyright || `Signed with elaraSign | ${GENERATION_LABELS[options.generationMethod]}`,
		Description:
			options.description ||
			`${GENERATION_LABELS[options.generationMethod]}. Generator: ${options.generator}. Verified by elaraSign.`,
		Source: "elaraSign Content Provenance Standard - https://sign.openelara.org",
		"Creation Time": options.timestamp,

		// elaraSign-specific (our DNA reference)
		Comment: JSON.stringify({
			elaraSign: {
				version: "2.0",
				metaHash: options.metaHash,
				generationMethod: options.generationMethod,
				timestamp: options.timestamp,
			},
			generator: options.generator,
			model: options.model,
		}),

		// XMP-style namespace (some tools read this)
		"XML:com.openelara.elarasign": JSON.stringify({
			version: "2.0",
			metaHash: options.metaHash,
			method: options.generationMethod,
		}),
	};
}

// ============================================================================
// SIDECAR FILE GENERATION
// ============================================================================

/**
 * Generate a JSON sidecar file with full provenance data
 * This is the "public record" that can be shared alongside the file
 */
export function generateSidecar(
	options: StandardMetadataOptions & {
		contentHash: string;
		locations: string[];
		originalFilename?: string;
	},
): SidecarMetadata {
	return {
		elaraSign: {
			version: "2.0",
			metaHash: options.metaHash,
			contentHash: options.contentHash,
			locations: options.locations,
			timestamp: options.timestamp,
		},
		generation: {
			method: options.generationMethod,
			generator: options.generator,
			model: options.model,
			timestamp: options.timestamp,
		},
		standard: {
			creator: options.creator || options.generator,
			copyright: options.copyright || `Signed with elaraSign | ${GENERATION_LABELS[options.generationMethod]}`,
			software: "elaraSign v2.0",
			description: options.description || `${GENERATION_LABELS[options.generationMethod]} verified by elaraSign`,
		},
	};
}

/**
 * Generate a human-readable provenance certificate (text format)
 */
export function generateCertificate(
	options: StandardMetadataOptions & {
		contentHash: string;
		locations: string[];
		originalFilename?: string;
	},
): string {
	const lines = [
		"═══════════════════════════════════════════════════════════════",
		"                    elaraSign PROVENANCE CERTIFICATE           ",
		"═══════════════════════════════════════════════════════════════",
		"",
		`File: ${options.originalFilename || "Unknown"}`,
		`Signed: ${options.timestamp}`,
		"",
		"── PROVENANCE ──────────────────────────────────────────────────",
		`Generation Method: ${GENERATION_LABELS[options.generationMethod]}`,
		`Generator: ${options.generator}`,
		options.model ? `Model: ${options.model}` : null,
		"",
		"── VERIFICATION ────────────────────────────────────────────────",
		"elaraSign Version: 2.0",
		`Meta Hash: ${options.metaHash}`,
		`Content Hash: ${options.contentHash}`,
		`Signature Locations: ${options.locations.join(", ")}`,
		"",
		"── STANDARD METADATA ───────────────────────────────────────────",
		`Creator: ${options.creator || options.generator}`,
		`Copyright: ${options.copyright || "Signed with elaraSign"}`,
		"",
		"═══════════════════════════════════════════════════════════════",
		"Verify at: https://sign.openelara.org",
		'"Transparency is not optional"',
		"═══════════════════════════════════════════════════════════════",
	].filter(Boolean);

	return lines.join("\n");
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format ISO timestamp to EXIF format (YYYY:MM:DD HH:MM:SS)
 */
function formatExifDate(isoTimestamp: string): string {
	try {
		const date = new Date(isoTimestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${year}:${month}:${day} ${hours}:${minutes}:${seconds}`;
	} catch {
		return new Date().toISOString().replace("T", " ").substring(0, 19).replace(/-/g, ":");
	}
}

/**
 * Build Windows-visible metadata summary
 * Returns the key fields that show in Properties → Details
 */
export function buildWindowsMetadata(options: StandardMetadataOptions): {
	title: string;
	subject: string;
	authors: string;
	copyright: string;
	comments: string;
} {
	return {
		title: `elaraSign Verified: ${options.metaHash.substring(0, 8)}`,
		subject: GENERATION_LABELS[options.generationMethod],
		authors: options.creator || options.generator,
		copyright: options.copyright || `Signed with elaraSign - ${GENERATION_LABELS[options.generationMethod]}`,
		comments: `Provenance verified by elaraSign v2.0. Hash: ${options.metaHash}. Generator: ${options.generator}.`,
	};
}
