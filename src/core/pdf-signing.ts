/**
 * elaraSign PDF Signing Module
 * ============================
 *
 * Professional PDF signing with provenance metadata using pdf-lib.
 * Part of the openElaraUniverse.
 *
 * LAYERS:
 * 1. /Info Dictionary - Standard PDF metadata fields (Title, Author, Keywords, etc.)
 * 2. Custom Properties - ElaraSign entries in document catalog
 *
 * @author OpenElara Project
 * @license MIT
 * @version 2.0.0
 */

import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Generation method for content
 */
export type GenerationMethod = "ai" | "human" | "mixed" | "unknown";

/**
 * PDF-specific metadata for signing
 */
export interface PdfSigningMetadata {
	/** How the content was generated */
	method: GenerationMethod;

	/** Generator application identifier */
	generator: string;

	/** Model used (for AI content) */
	model?: string;

	/** ISO 8601 timestamp */
	generatedAt: string;

	/** SHA-256 hash of user ID (privacy) */
	userFingerprint: string;

	/** Original document title (preserved) */
	originalTitle?: string;

	/** Original author (preserved) */
	originalAuthor?: string;

	/** AI character that generated this (if applicable) */
	characterId?: string;

	/** SHA-256 of prompt used */
	promptHash?: string;

	/** Additional custom fields */
	custom?: Record<string, string>;
}

/**
 * Result of PDF signing operation
 */
export interface PdfSigningResult {
	/** Signed PDF bytes */
	signedPdf: Uint8Array;

	/** SHA-256 hash of original content */
	contentHash: string;

	/** SHA-256 hash of metadata */
	metaHash: string;

	/** Combined signature hash */
	signatureHash: string;

	/** Metadata that was embedded */
	metadata: PdfSigningMetadata;
}

/**
 * Result of PDF verification
 */
export interface PdfVerificationResult {
	/** Whether elaraSign metadata was found */
	isSigned: boolean;

	/** Extracted metadata (if found) */
	metadata?: Partial<PdfSigningMetadata>;

	/** Signature hash from PDF */
	signatureHash?: string;

	/** Content hash from PDF */
	contentHash?: string;

	/** Which layers were found */
	layersFound: {
		infoDict: boolean;
		customProps: boolean;
		keywords: boolean;
	};

	/** Error message if verification failed */
	error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** elaraSign marker for PDFs */
export const ELARA_PDF_MARKER = "elaraSign-v2.0";

/** XMP namespace for elaraSign (reserved for future use) */
export const ELARA_XMP_NAMESPACE = "http://openelara.org/xmp/1.0/";

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Compute SHA-256 hash of data
 */
export async function sha256(data: Uint8Array): Promise<string> {
	// Use Node.js crypto for server-side hashing
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(data).digest("hex");
}

/**
 * Generate signature hash from content and metadata
 */
export async function generateSignatureHash(
	contentHash: string,
	metadata: PdfSigningMetadata,
): Promise<{ metaHash: string; signatureHash: string }> {
	const metaJson = JSON.stringify({
		method: metadata.method,
		generator: metadata.generator,
		model: metadata.model || "",
		generatedAt: metadata.generatedAt,
		userFingerprint: metadata.userFingerprint,
	});

	const metaBytes = new TextEncoder().encode(metaJson);
	const metaHash = await sha256(metaBytes);

	const combined = new TextEncoder().encode(contentHash + metaHash);
	const signatureHash = await sha256(combined);

	return { metaHash, signatureHash };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Sign a PDF with elaraSign provenance metadata
 *
 * Uses pdf-lib to properly modify PDF structure:
 * - Sets /Info dictionary fields (Creator, Producer, Keywords, Subject)
 * - Adds custom entries to document catalog
 *
 * @param pdfBytes - Original PDF file bytes
 * @param metadata - Signing metadata
 * @returns Signed PDF with embedded provenance
 */
export async function signPdf(pdfBytes: Uint8Array, metadata: PdfSigningMetadata): Promise<PdfSigningResult> {
	// Compute content hash of original PDF
	const contentHash = await sha256(pdfBytes);

	// Generate signature hashes
	const { metaHash, signatureHash } = await generateSignatureHash(contentHash, metadata);

	// Load the PDF
	const pdf = await PDFDocument.load(pdfBytes, {
		ignoreEncryption: true,
		updateMetadata: false,
	});

	// Preserve original metadata
	const originalTitle = metadata.originalTitle || pdf.getTitle();
	const originalAuthor = metadata.originalAuthor || pdf.getAuthor();

	// Update metadata object
	metadata.originalTitle = originalTitle;
	metadata.originalAuthor = originalAuthor;

	// =========================================================================
	// Layer 1: /Info Dictionary (standard PDF metadata)
	// =========================================================================

	if (originalTitle) {
		pdf.setTitle(originalTitle);
	}
	if (originalAuthor) {
		pdf.setAuthor(originalAuthor);
	}

	// Set elaraSign identification
	pdf.setCreator("elaraSign v2.0 - openElaraUniverse");
	pdf.setProducer(`elaraSign/${metadata.generator}`);
	pdf.setSubject(`Signed by elaraSign | ${signatureHash.slice(0, 16)} | Method: ${metadata.method}`);

	// Set creation/modification dates
	pdf.setCreationDate(new Date(metadata.generatedAt));
	pdf.setModificationDate(new Date());

	// Keywords encode key provenance info (searchable, survives most processing)
	const keywords = [
		"elara-signed",
		`method:${metadata.method}`,
		`generator:${metadata.generator}`,
		`sig:${signatureHash.slice(0, 32)}`,
	];
	if (metadata.model) {
		keywords.push(`model:${metadata.model}`);
	}
	pdf.setKeywords(keywords);

	// =========================================================================
	// Layer 2: Custom entries in document catalog
	// =========================================================================

	const catalogRef = pdf.context.trailerInfo.Root;
	const catalog = pdf.context.lookup(catalogRef);

	if (catalog instanceof PDFDict) {
		catalog.set(PDFName.of("ElaraSign"), PDFString.of(ELARA_PDF_MARKER));
		catalog.set(PDFName.of("ElaraSignature"), PDFString.of(signatureHash));
		catalog.set(PDFName.of("ElaraContentHash"), PDFString.of(contentHash));
		catalog.set(PDFName.of("ElaraMethod"), PDFString.of(metadata.method));
		catalog.set(PDFName.of("ElaraGenerator"), PDFString.of(metadata.generator));
		catalog.set(PDFName.of("ElaraTimestamp"), PDFString.of(metadata.generatedAt));
		catalog.set(PDFName.of("ElaraFingerprint"), PDFString.of(metadata.userFingerprint));

		if (metadata.model) {
			catalog.set(PDFName.of("ElaraModel"), PDFString.of(metadata.model));
		}
		if (metadata.characterId) {
			catalog.set(PDFName.of("ElaraCharacter"), PDFString.of(metadata.characterId));
		}
		if (metadata.promptHash) {
			catalog.set(PDFName.of("ElaraPromptHash"), PDFString.of(metadata.promptHash));
		}
	}

	// =========================================================================
	// Save the PDF
	// =========================================================================

	const signedPdfBytes = await pdf.save();

	return {
		signedPdf: signedPdfBytes,
		contentHash,
		metaHash,
		signatureHash,
		metadata,
	};
}

/**
 * Verify elaraSign metadata in a PDF
 *
 * Checks multiple layers for elaraSign provenance data.
 *
 * @param pdfBytes - PDF to verify
 * @returns Verification result
 */
export async function verifyPdf(pdfBytes: Uint8Array): Promise<PdfVerificationResult> {
	const result: PdfVerificationResult = {
		isSigned: false,
		layersFound: {
			infoDict: false,
			customProps: false,
			keywords: false,
		},
	};

	try {
		const pdf = await PDFDocument.load(pdfBytes, {
			ignoreEncryption: true,
			updateMetadata: false,
		});

		// =========================================================================
		// Check Layer 1: /Info Dictionary
		// =========================================================================

		const creator = pdf.getCreator();
		const producer = pdf.getProducer();
		const subject = pdf.getSubject();
		const keywords = pdf.getKeywords();

		if (creator?.includes("elaraSign") || producer?.includes("elaraSign")) {
			result.isSigned = true;
			result.layersFound.infoDict = true;
		}

		// Check keywords
		if (keywords?.includes("elara-signed")) {
			result.isSigned = true;
			result.layersFound.keywords = true;

			result.metadata = {};

			// Keywords are comma-separated
			for (const kw of keywords.split(",").map((k) => k.trim())) {
				if (kw.startsWith("method:")) {
					result.metadata.method = kw.slice(7) as GenerationMethod;
				} else if (kw.startsWith("generator:")) {
					result.metadata.generator = kw.slice(10);
				} else if (kw.startsWith("model:")) {
					result.metadata.model = kw.slice(6);
				} else if (kw.startsWith("sig:")) {
					result.signatureHash = kw.slice(4);
				}
			}
		}

		// Extract from subject
		if (subject?.includes("Signed by elaraSign")) {
			const sigMatch = subject.match(/\|\s*([a-f0-9]+)\s*\|/);
			if (sigMatch) {
				result.signatureHash = sigMatch[1];
			}
		}

		// =========================================================================
		// Check Layer 2: Custom catalog entries
		// =========================================================================

		const catalogRef = pdf.context.trailerInfo.Root;
		const catalog = pdf.context.lookup(catalogRef);

		if (catalog instanceof PDFDict) {
			const elaraSign = catalog.get(PDFName.of("ElaraSign"));

			if (elaraSign) {
				result.isSigned = true;
				result.layersFound.customProps = true;

				const getString = (name: string): string | undefined => {
					const val = catalog.get(PDFName.of(name));
					if (val instanceof PDFString) {
						return val.decodeText();
					}
					return undefined;
				};

				result.signatureHash = getString("ElaraSignature") || result.signatureHash;
				result.contentHash = getString("ElaraContentHash");

				result.metadata = result.metadata || {};
				result.metadata.method = (getString("ElaraMethod") as GenerationMethod) || result.metadata.method;
				result.metadata.generator = getString("ElaraGenerator") || result.metadata.generator;
				result.metadata.generatedAt = getString("ElaraTimestamp");
				result.metadata.userFingerprint = getString("ElaraFingerprint");
				result.metadata.model = getString("ElaraModel") || result.metadata.model;
				result.metadata.characterId = getString("ElaraCharacter");
				result.metadata.promptHash = getString("ElaraPromptHash");
			}
		}

		// Preserve original title/author
		if (result.metadata) {
			result.metadata.originalTitle = pdf.getTitle();
			result.metadata.originalAuthor = pdf.getAuthor();
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : "Failed to parse PDF";
	}

	return result;
}

/**
 * Quick check if PDF has elaraSign metadata
 */
export async function hasPdfSignature(pdfBytes: Uint8Array): Promise<boolean> {
	try {
		const pdf = await PDFDocument.load(pdfBytes, {
			ignoreEncryption: true,
			updateMetadata: false,
		});

		// Check keywords
		const keywords = pdf.getKeywords();
		if (keywords?.includes("elara-signed")) {
			return true;
		}

		// Check creator/producer
		const creator = pdf.getCreator();
		const producer = pdf.getProducer();
		if (creator?.includes("elaraSign") || producer?.includes("elaraSign")) {
			return true;
		}

		// Check catalog
		const catalogRef = pdf.context.trailerInfo.Root;
		const catalog = pdf.context.lookup(catalogRef);
		if (catalog instanceof PDFDict) {
			if (catalog.get(PDFName.of("ElaraSign"))) {
				return true;
			}
		}

		return false;
	} catch {
		return false;
	}
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
	signPdf,
	verifyPdf,
	hasPdfSignature,
	sha256,
	generateSignatureHash,
	ELARA_PDF_MARKER,
	ELARA_XMP_NAMESPACE,
};
