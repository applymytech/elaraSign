/**
 * elaraSign PDF Digital Signature Module
 * =======================================
 *
 * Adds INDUSTRY-STANDARD PKCS#7 digital signatures to PDFs.
 * This makes signatures visible in Adobe Reader, Windows, etc.
 *
 * ARCHITECTURE:
 * 1. elaraSign metadata layer (our custom provenance data)
 * 2. PKCS#7 digital signature (industry standard)
 *
 * The signature includes:
 * - PUBLIC: Signer name, email, timestamp, reason, location
 * - BURIED: User fingerprint, IP hash, model info (in signature metadata)
 *
 * CERTIFICATE OPTIONS:
 * - Self-signed: Shows in Adobe (yellow banner "untrusted")
 * - CA-signed: Shows in Adobe (blue banner "trusted")
 *
 * For sovereign deployment, generate your own P12 certificate.
 *
 * @author OpenElara Project
 * @license MIT
 * @version 2.0.0
 */

import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signer information for the digital signature
 * This is what appears in Adobe Reader's signature panel
 */
export interface SignerInfo {
	/** Full legal name of signer */
	name: string;

	/** Email address (public record) */
	email: string;

	/** Reason for signing */
	reason?: string;

	/** Location/organization */
	location?: string;

	/** Contact info (optional) */
	contactInfo?: string;
}

/**
 * Provenance data that gets embedded in signature metadata
 * Some public, some buried
 */
export interface ProvenanceData {
	/** Generation method */
	method: "ai" | "human" | "mixed" | "unknown";

	/** Generator application */
	generator: string;

	/** Model used (for AI content) */
	model?: string;

	/** AI character ID (if applicable) */
	characterId?: string;

	/** SHA-256 of user ID */
	userFingerprint: string;

	/** SHA-256 of client IP (buried) */
	ipHash?: string;

	/** Platform code (e.g., 'elara-cloud', 'elara-desktop') */
	platformCode: string;

	/** Custom user code for watermark identification */
	userCode?: string;
}

/**
 * Full signing options
 */
export interface PdfDigitalSignOptions {
	/** Signer information (visible in Adobe) */
	signer: SignerInfo;

	/** Provenance data (our custom metadata) */
	provenance: ProvenanceData;

	/** P12 certificate buffer (required for PKCS#7) */
	p12Certificate?: Buffer;

	/** P12 certificate password */
	p12Password?: string;

	/** Use self-signed certificate if no P12 provided */
	useSelfSigned?: boolean;
}

/**
 * Result of signing operation
 */
export interface PdfDigitalSignResult {
	/** Signed PDF bytes */
	signedPdf: Uint8Array;

	/** SHA-256 of original content */
	contentHash: string;

	/** SHA-256 of metadata */
	metaHash: string;

	/** Whether PKCS#7 signature was applied */
	hasPkcs7Signature: boolean;

	/** Signature details */
	signatureInfo: {
		signer: SignerInfo;
		timestamp: string;
		serialNumber?: string;
	};
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Compute SHA-256 hash
 */
function sha256(data: Uint8Array | string): string {
	const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
	return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Hash an IP address for privacy
 */
export function hashIpAddress(ip: string): string {
	// Add salt to prevent rainbow table attacks
	const salted = `elarasign:ip:${ip}:${new Date().toISOString().slice(0, 10)}`;
	return sha256(salted).slice(0, 32);
}

// ============================================================================
// PDF SIGNING
// ============================================================================

/**
 * Sign a PDF with elaraSign provenance + optional PKCS#7 digital signature
 *
 * This creates a two-layer signature:
 * 1. elaraSign metadata in PDF /Info and catalog (always)
 * 2. PKCS#7 digital signature (if certificate provided)
 *
 * @param pdfBytes - Original PDF
 * @param options - Signing options
 * @returns Signed PDF with metadata
 */
export async function signPdfWithDigitalSignature(
	pdfBytes: Uint8Array,
	options: PdfDigitalSignOptions,
): Promise<PdfDigitalSignResult> {
	const { signer, provenance } = options;
	const timestamp = new Date().toISOString();

	// Compute content hash
	const contentHash = sha256(pdfBytes);

	// Build metadata for hashing
	const metadataForHash = {
		signer: {
			name: signer.name,
			email: signer.email,
		},
		provenance: {
			method: provenance.method,
			generator: provenance.generator,
			userFingerprint: provenance.userFingerprint,
			platformCode: provenance.platformCode,
		},
		timestamp,
		contentHash,
	};
	const metaHash = sha256(JSON.stringify(metadataForHash));

	// Load PDF
	const pdf = await PDFDocument.load(pdfBytes, {
		ignoreEncryption: true,
		updateMetadata: false,
	});

	// =========================================================================
	// Layer 1: elaraSign Metadata (our sovereign provenance)
	// =========================================================================

	// Standard PDF /Info fields (visible in Properties)
	pdf.setAuthor(signer.name);
	pdf.setCreator(`elaraSign v2.0 - Digital Signature by ${signer.name}`);
	pdf.setProducer(`elaraSign/${provenance.generator}`);
	pdf.setSubject(`Digitally signed by ${signer.name} | ${provenance.method.toUpperCase()} | ${metaHash.slice(0, 16)}`);

	// Keywords for searchability
	const keywords = [
		"elarasign-certified",
		`signer:${signer.name.replace(/\s+/g, "-")}`,
		`method:${provenance.method}`,
		`platform:${provenance.platformCode}`,
		`hash:${metaHash.slice(0, 24)}`,
	];
	if (provenance.userCode) {
		keywords.push(`usercode:${provenance.userCode}`);
	}
	pdf.setKeywords(keywords);

	// Set dates
	pdf.setCreationDate(new Date(timestamp));
	pdf.setModificationDate(new Date(timestamp));

	// =========================================================================
	// Layer 2: PKCS#7 Digital Signature (industry standard)
	// =========================================================================

	let hasPkcs7Signature = false;
	let signedPdfBytes: Uint8Array;

	if (options.p12Certificate && options.p12Password) {
		// Full PKCS#7 signature with provided certificate
		try {
			// Dynamic import to avoid issues if packages not installed
			const { SignPdf } = await import("@signpdf/signpdf");
			const { pdflibAddPlaceholder } = await import("@signpdf/placeholder-pdf-lib");
			const { P12Signer } = await import("@signpdf/signer-p12");

			// Add signature placeholder with signer info
			pdflibAddPlaceholder({
				pdfDoc: pdf,
				reason: signer.reason || `Content provenance: ${provenance.method.toUpperCase()}`,
				contactInfo: signer.email,
				name: signer.name,
				location: signer.location || `elaraSign ${provenance.platformCode}`,
			});

			// Save PDF with placeholder
			const pdfWithPlaceholder = await pdf.save();

			// Create P12 signer
			const p12Signer = new P12Signer(options.p12Certificate, {
				passphrase: options.p12Password,
			});

			// Create SignPdf instance and sign
			const signPdfInstance = new SignPdf();
			signedPdfBytes = await signPdfInstance.sign(Buffer.from(pdfWithPlaceholder), p12Signer);
			hasPkcs7Signature = true;
		} catch (error) {
			console.error("PKCS#7 signing failed, falling back to metadata-only:", error);
			signedPdfBytes = await pdf.save();
		}
	} else {
		// Metadata-only signing (no PKCS#7)
		signedPdfBytes = await pdf.save();
	}

	return {
		signedPdf: signedPdfBytes,
		contentHash,
		metaHash,
		hasPkcs7Signature,
		signatureInfo: {
			signer,
			timestamp,
		},
	};
}

/**
 * Generate a self-signed P12 certificate for testing/development
 *
 * For production, you should:
 * 1. Generate your own CA
 * 2. Or purchase from a trusted CA
 *
 * This uses node-forge to create a self-signed certificate.
 */
export async function generateSelfSignedP12(commonName: string, email: string, password: string): Promise<Buffer> {
	// Dynamic import node-forge
	const forge = await import("node-forge");

	// Generate key pair
	const keys = forge.pki.rsa.generateKeyPair(2048);

	// Create certificate
	const cert = forge.pki.createCertificate();
	cert.publicKey = keys.publicKey;
	cert.serialNumber = Date.now().toString(16);
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date();
	cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

	// Set subject/issuer
	const attrs = [
		{ name: "commonName", value: commonName },
		{ name: "emailAddress", value: email },
		{ name: "organizationName", value: "elaraSign Self-Signed" },
	];
	cert.setSubject(attrs);
	cert.setIssuer(attrs);

	// Add extensions
	cert.setExtensions([
		{
			name: "basicConstraints",
			cA: false,
		},
		{
			name: "keyUsage",
			digitalSignature: true,
			nonRepudiation: true,
		},
		{
			name: "extKeyUsage",
			emailProtection: true,
		},
	]);

	// Self-sign
	cert.sign(keys.privateKey, forge.md.sha256.create());

	// Create PKCS#12
	const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
		algorithm: "3des",
	});
	const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

	return Buffer.from(p12Der, "binary");
}

/**
 * Verify if a PDF has PKCS#7 digital signature
 * Note: This only checks for presence, not validity
 */
export async function hasPkcs7Signature(pdfBytes: Uint8Array): Promise<boolean> {
	const pdfString = Buffer.from(pdfBytes).toString("latin1");
	// Look for signature dictionary markers
	return pdfString.includes("/Type /Sig") && pdfString.includes("/SubFilter");
}
