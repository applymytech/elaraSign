/**
 * elaraSign Video Signing Module (SCAFFOLD)
 * =========================================
 *
 * Future implementation for video provenance signing.
 * Part of the openElaraUniverse.
 *
 * VIDEO SIGNING IS COMPLEX - This file defines types and interfaces
 * for future implementation. Expected timeline: months.
 *
 * PLANNED LAYERS:
 * 1. Container Metadata - MP4 moov/udta, MKV tags, WebM tags
 * 2. Sidecar File - .elara.json manifest with hashes
 * 3. Audio Watermark - Spread spectrum in audio track (future)
 * 4. Keyframe Visual - I-frame watermarking (future, expensive)
 *
 * @author OpenElara Project
 * @license MIT
 * @version 2.0.0
 * @status SCAFFOLD - Not yet implemented
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Generation method for content
 */
export type GenerationMethod = "ai" | "human" | "mixed" | "unknown";

/**
 * Supported video formats
 */
export type VideoFormat = "mp4" | "webm" | "mkv" | "mov" | "avi" | "unknown";

/**
 * Video-specific metadata for signing
 */
export interface VideoSigningMetadata {
	/** How the content was generated */
	method: GenerationMethod;

	/** Generator application identifier */
	generator: string;

	/** Model used (for AI-generated video) */
	model?: string;

	/** ISO 8601 timestamp */
	generatedAt: string;

	/** SHA-256 hash of user ID (privacy) */
	userFingerprint: string;

	/** Original title */
	originalTitle?: string;

	/** AI character that generated this (if applicable) */
	characterId?: string;

	/** SHA-256 of prompt used */
	promptHash?: string;

	/** Duration in seconds */
	duration?: number;

	/** Width in pixels */
	width?: number;

	/** Height in pixels */
	height?: number;

	/** Frame rate */
	fps?: number;

	/** Video codec */
	videoCodec?: string;

	/** Audio codec */
	audioCodec?: string;

	/** Additional custom fields */
	custom?: Record<string, string>;
}

/**
 * Sidecar manifest for video files
 * This approach works for any format without re-encoding
 */
export interface VideoSidecar {
	/** Sidecar version */
	version: "2.0";

	/** elaraSign marker */
	marker: "elaraSign-video";

	/** SHA-256 of original video file */
	contentHash: string;

	/** SHA-256 of metadata */
	metaHash: string;

	/** Combined signature hash */
	signatureHash: string;

	/** Video duration in seconds */
	duration: number;

	/** Video resolution */
	resolution: {
		width: number;
		height: number;
	};

	/** Full metadata */
	metadata: VideoSigningMetadata;

	/** Optional: SHA-256 of each keyframe (I-frame) */
	keyframeHashes?: string[];

	/** Optional: timestamps of keyframes */
	keyframeTimestamps?: number[];

	/** ISO 8601 timestamp of signing */
	signedAt: string;
}

/**
 * Result of video signing operation
 */
export interface VideoSigningResult {
	/** Signed video bytes (with container metadata) */
	signedVideo: Uint8Array;

	/** Sidecar JSON manifest */
	sidecar: VideoSidecar;

	/** Detected format */
	format: VideoFormat;

	/** SHA-256 hash of original video */
	contentHash: string;

	/** Which layers were applied */
	layersApplied: {
		containerMetadata: boolean;
		audioWatermark: boolean;
		keyframeWatermark: boolean;
	};
}

/**
 * Result of video verification
 */
export interface VideoVerificationResult {
	/** Whether elaraSign metadata was found */
	isSigned: boolean;

	/** Detected format */
	format: VideoFormat;

	/** Extracted metadata (if found) */
	metadata?: VideoSigningMetadata;

	/** Signature hash */
	signatureHash?: string;

	/** Whether sidecar was found/verified */
	sidecarVerified?: boolean;

	/** Which layers were found */
	layersFound: {
		containerMetadata: boolean;
		sidecar: boolean;
		audioWatermark: boolean;
		keyframeWatermark: boolean;
	};

	/** Error message if verification failed */
	error?: string;
}

/**
 * Options for video signing
 */
export interface VideoSigningOptions {
	/** Include audio watermark (requires ffmpeg) */
	audioWatermark?: boolean;

	/** Include keyframe watermark (expensive, requires ffmpeg) */
	keyframeWatermark?: boolean;

	/** Generate sidecar file */
	generateSidecar?: boolean;

	/** Extract keyframe hashes for sidecar */
	extractKeyframeHashes?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** elaraSign marker for videos */
export const ELARA_VIDEO_MARKER = "elaraSign-v2.0-video";

/** Default sidecar filename suffix */
export const SIDECAR_SUFFIX = ".elara.json";

// ============================================================================
// PLACEHOLDER IMPLEMENTATIONS
// ============================================================================

/**
 * Detect video format from bytes
 *
 * @param data - First bytes of video file
 * @returns Detected format
 */
export function detectVideoFormat(data: Uint8Array): VideoFormat {
	if (data.length < 12) {
		return "unknown";
	}

	// MP4/M4V: ftyp at byte 4
	if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
		return "mp4";
	}

	// WebM: 0x1A 0x45 0xDF 0xA3 (EBML header)
	if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
		// Could be MKV or WebM, check doctype
		return "webm"; // Simplified
	}

	// AVI: RIFF....AVI
	if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
		if (data[8] === 0x41 && data[9] === 0x56 && data[10] === 0x49) {
			return "avi";
		}
	}

	// MOV: various ftyp brands (qt, moov at start)
	if (data[4] === 0x6d && data[5] === 0x6f && data[6] === 0x6f && data[7] === 0x76) {
		return "mov";
	}

	return "unknown";
}

/**
 * Sign a video file with elaraSign provenance metadata
 *
 * SCAFFOLD - Not yet implemented
 *
 * @param videoBytes - Original video file bytes
 * @param metadata - Signing metadata
 * @param options - Signing options
 * @returns Signed video with embedded provenance
 */
export async function signVideo(
	_videoBytes: Uint8Array,
	_metadata: VideoSigningMetadata,
	_options?: VideoSigningOptions,
): Promise<VideoSigningResult> {
	throw new Error(
		"Video signing not yet implemented. " +
			"Expected timeline: months. " +
			"For now, generate a sidecar file manually using createVideoSidecar().",
	);
}

/**
 * Create a sidecar manifest for a video file
 * This works NOW without any video processing libraries
 *
 * @param videoBytes - Video file bytes
 * @param metadata - Signing metadata
 * @param duration - Video duration in seconds (you must provide this)
 * @param width - Video width
 * @param height - Video height
 * @returns Sidecar manifest
 */
export async function createVideoSidecar(
	videoBytes: Uint8Array,
	metadata: VideoSigningMetadata,
	duration: number,
	width: number,
	height: number,
): Promise<VideoSidecar> {
	// Compute content hash using Node.js crypto
	const { createHash } = await import("node:crypto");
	const contentHash = createHash("sha256").update(videoBytes).digest("hex");

	// Compute metadata hash
	const metaJson = JSON.stringify({
		method: metadata.method,
		generator: metadata.generator,
		model: metadata.model || "",
		generatedAt: metadata.generatedAt,
		userFingerprint: metadata.userFingerprint,
	});

	const metaHash = createHash("sha256").update(metaJson).digest("hex");

	// Combined signature hash
	const signatureHash = createHash("sha256")
		.update(contentHash + metaHash)
		.digest("hex");

	return {
		version: "2.0",
		marker: "elaraSign-video",
		contentHash,
		metaHash,
		signatureHash,
		duration,
		resolution: { width, height },
		metadata: {
			...metadata,
			duration,
			width,
			height,
		},
		signedAt: new Date().toISOString(),
	};
}

/**
 * Verify elaraSign metadata in a video file
 *
 * SCAFFOLD - Not yet implemented
 *
 * @param videoBytes - Video to verify
 * @returns Verification result
 */
export async function verifyVideo(_videoBytes: Uint8Array): Promise<VideoVerificationResult> {
	throw new Error(
		"Video verification not yet implemented. " + "For now, verify sidecar files manually using verifyVideoSidecar().",
	);
}

/**
 * Verify a video against its sidecar manifest
 * This works NOW
 *
 * @param videoBytes - Video file bytes
 * @param sidecar - Sidecar manifest to verify against
 * @returns Whether the video matches the sidecar
 */
export async function verifyVideoSidecar(
	videoBytes: Uint8Array,
	sidecar: VideoSidecar,
): Promise<{ valid: boolean; error?: string }> {
	try {
		// Compute content hash using Node.js crypto
		const { createHash } = await import("node:crypto");
		const contentHash = createHash("sha256").update(videoBytes).digest("hex");

		if (contentHash !== sidecar.contentHash) {
			return { valid: false, error: "Content hash mismatch - video has been modified" };
		}

		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
	// Format detection (works now)
	detectVideoFormat,

	// Sidecar approach (works now)
	createVideoSidecar,
	verifyVideoSidecar,

	// Full signing (scaffold)
	signVideo,
	verifyVideo,

	// Constants
	ELARA_VIDEO_MARKER,
	SIDECAR_SUFFIX,
};
