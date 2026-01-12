/**
 * elaraSign - Universal File Signing Library
 * Part of the openElaraUniverse
 *
 * The canonical implementation of the Elara signing standard.
 * Supports: Images (PNG/JPEG/WebP), PDFs, Audio (MP3/WAV), Video (sidecar)
 */

// ============================================================================
// AUDIO SIGNING (Surface metadata: ID3, INFO chunks)
// ============================================================================
export {
	type AudioFormat,
	type AudioSigningMetadata,
	type AudioSigningResult,
	type AudioVerificationResult,
	detectAudioFormat,
	ELARA_AUDIO_MARKER,
	type GenerationMethod as AudioGenerationMethod,
	hasAudioSignature,
	signAudio,
	verifyAudio,
} from "./core/audio-signing.js";

// ============================================================================
// PDF SIGNING (2-layer: /Info Dictionary, Custom Catalog Properties)
// ============================================================================
export {
	ELARA_PDF_MARKER,
	ELARA_XMP_NAMESPACE,
	type GenerationMethod as PdfGenerationMethod,
	hasPdfSignature,
	type PdfSigningMetadata,
	type PdfSigningResult,
	type PdfVerificationResult,
	signPdf,
	verifyPdf,
} from "./core/pdf-signing.js";
// ============================================================================
// IMAGE SIGNING (4-layer: Billboard, DNA, Spread, Forensic)
// ============================================================================
export {
	createMetadata,
	ELARA_MARKER,
	ELARA_VERSION,
	extractMultiLocationSignature,
	hasAnyElaraSignature,
	hasElaraSignature,
	readSignature,
	SIGNATURE_LOCATIONS,
	signImageContent,
	verifyImageContent,
} from "./core/signing-core.js";

// ============================================================================
// VIDEO SIGNING (Scaffold - sidecar manifest ready, full signing future)
// ============================================================================
export {
	createVideoSidecar,
	detectVideoFormat,
	ELARA_VIDEO_MARKER,
	type GenerationMethod as VideoGenerationMethod,
	SIDECAR_SUFFIX,
	type VideoFormat,
	type VideoSidecar,
	type VideoSigningMetadata,
	type VideoSigningResult,
	type VideoVerificationResult,
	verifyVideoSidecar,
} from "./core/video-signing.js";
