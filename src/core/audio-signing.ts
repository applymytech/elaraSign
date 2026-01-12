/**
 * elaraSign Audio Signing Module
 * ==============================
 *
 * Surface-level metadata signing for audio files (MP3, WAV, FLAC, etc.)
 * Part of the openElaraUniverse.
 *
 * Unlike images, audio signing focuses on:
 * - ID3 tags (MP3)
 * - INFO chunks (WAV)
 * - Vorbis comments (FLAC/OGG)
 * - Standard metadata fields
 *
 * NO spread-spectrum watermarking - that's image-specific.
 * This is purely metadata-based provenance tracking.
 *
 * @author OpenElara Project
 * @license MIT
 * @version 2.0.0
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Generation method for content
 */
export type GenerationMethod = "ai" | "human" | "mixed" | "unknown";

/**
 * Supported audio formats
 */
export type AudioFormat = "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a" | "unknown";

/**
 * Audio-specific metadata for signing
 */
export interface AudioSigningMetadata {
	/** How the content was generated */
	method: GenerationMethod;

	/** Generator application identifier */
	generator: string;

	/** Model used (for AI-generated audio) */
	model?: string;

	/** ISO 8601 timestamp */
	generatedAt: string;

	/** SHA-256 hash of user ID (privacy) */
	userFingerprint: string;

	/** Original title (preserved) */
	originalTitle?: string;

	/** Original artist (preserved) */
	originalArtist?: string;

	/** AI character that generated this (if applicable) */
	characterId?: string;

	/** SHA-256 of prompt/text used for TTS */
	promptHash?: string;

	/** Voice model used (for TTS) */
	voiceModel?: string;

	/** Duration in seconds */
	duration?: number;

	/** Sample rate in Hz */
	sampleRate?: number;

	/** Additional custom fields */
	custom?: Record<string, string>;
}

/**
 * Result of audio signing operation
 */
export interface AudioSigningResult {
	/** Signed audio bytes */
	signedAudio: Uint8Array;

	/** Detected format */
	format: AudioFormat;

	/** SHA-256 hash of original audio data */
	contentHash: string;

	/** SHA-256 hash of metadata */
	metaHash: string;

	/** Combined signature hash */
	signatureHash: string;

	/** Metadata that was embedded */
	metadata: AudioSigningMetadata;

	/** Which method was used for embedding */
	embeddingMethod: "id3" | "info-chunk" | "vorbis" | "trailer";
}

/**
 * Result of audio verification
 */
export interface AudioVerificationResult {
	/** Whether elaraSign metadata was found */
	isSigned: boolean;

	/** Detected format */
	format: AudioFormat;

	/** Extracted metadata (if found) */
	metadata?: AudioSigningMetadata;

	/** Signature hash from audio */
	signatureHash?: string;

	/** Error message if verification failed */
	error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** elaraSign marker for audio */
export const ELARA_AUDIO_MARKER = "elaraSign-v2.0-audio";

/** ID3v2.3 frame IDs we use */
export const ID3_FRAMES = {
	COMMENT: "COMM", // Comment frame (our main payload)
	SOFTWARE: "TSSE", // Software/encoder
	ENCODED_BY: "TENC", // Encoded by
	COPYRIGHT: "TCOP", // Copyright
	USER_DEFINED: "TXXX", // User-defined text (key-value)
} as const;

/** WAV INFO chunk IDs */
export const WAV_INFO = {
	SOFTWARE: "ISFT", // Software
	COMMENT: "ICMT", // Comment
	COPYRIGHT: "ICOP", // Copyright
	ARTIST: "IART", // Artist
	NAME: "INAM", // Name/Title
	GENRE: "IGNR", // Genre
	DATE: "ICRD", // Creation date
} as const;

// ============================================================================
// FORMAT DETECTION
// ============================================================================

/**
 * Detect audio format from bytes
 */
export function detectAudioFormat(data: Uint8Array): AudioFormat {
	if (data.length < 12) {
		return "unknown";
	}

	// MP3: Starts with ID3 or frame sync (0xFF 0xFB/FA/F3/F2)
	if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
		return "mp3"; // ID3v2
	}
	if (data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
		return "mp3"; // Frame sync
	}

	// WAV: RIFF....WAVE
	if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
		if (data[8] === 0x57 && data[9] === 0x41 && data[10] === 0x56 && data[11] === 0x45) {
			return "wav";
		}
	}

	// FLAC: fLaC
	if (data[0] === 0x66 && data[1] === 0x4c && data[2] === 0x61 && data[3] === 0x43) {
		return "flac";
	}

	// OGG: OggS
	if (data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) {
		return "ogg";
	}

	// AAC/M4A: ....ftyp
	if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
		return "m4a";
	}

	return "unknown";
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Compute SHA-256 hash
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
	metadata: AudioSigningMetadata,
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

/**
 * Build elaraSign comment payload
 */
function buildElaraComment(metadata: AudioSigningMetadata, signatureHash: string): string {
	const payload = {
		_elaraSign: ELARA_AUDIO_MARKER,
		sig: signatureHash,
		method: metadata.method,
		generator: metadata.generator,
		model: metadata.model,
		timestamp: metadata.generatedAt,
		fingerprint: metadata.userFingerprint,
		voice: metadata.voiceModel,
		character: metadata.characterId,
	};

	return JSON.stringify(payload);
}

// ============================================================================
// WAV SIGNING (INFO Chunk)
// ============================================================================

/**
 * Find position of LIST INFO chunk in WAV file
 */
function findWavInfoChunk(data: Uint8Array): { start: number; size: number } | null {
	// WAV structure: RIFF size WAVE [chunks...]
	// LIST INFO chunk: LIST size INFO [subchunks...]

	let pos = 12; // Skip RIFF header

	while (pos < data.length - 8) {
		const chunkId = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
		const chunkSize = data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24);

		if (chunkId === "LIST") {
			const listType = String.fromCharCode(data[pos + 8], data[pos + 9], data[pos + 10], data[pos + 11]);
			if (listType === "INFO") {
				return { start: pos, size: chunkSize + 8 };
			}
		}

		pos += 8 + chunkSize;
		if (chunkSize % 2 === 1) {
			pos++; // Pad byte
		}
	}

	return null;
}

/**
 * Build WAV LIST INFO chunk with elaraSign metadata
 */
function buildWavInfoChunk(metadata: AudioSigningMetadata, signatureHash: string): Uint8Array {
	const entries: { id: string; value: string }[] = [
		{ id: WAV_INFO.SOFTWARE, value: "elaraSign v2.0 - openElaraUniverse" },
		{ id: WAV_INFO.COMMENT, value: buildElaraComment(metadata, signatureHash) },
		{ id: WAV_INFO.COPYRIGHT, value: `Signed by elaraSign | ${signatureHash.slice(0, 16)}` },
		{ id: WAV_INFO.DATE, value: metadata.generatedAt },
	];

	if (metadata.originalArtist) {
		entries.push({ id: WAV_INFO.ARTIST, value: metadata.originalArtist });
	}
	if (metadata.originalTitle) {
		entries.push({ id: WAV_INFO.NAME, value: metadata.originalTitle });
	}

	// Calculate total size
	let dataSize = 4; // 'INFO'
	for (const entry of entries) {
		const valueBytes = new TextEncoder().encode(`${entry.value}\0`);
		dataSize += 8 + valueBytes.length;
		if (valueBytes.length % 2 === 1) {
			dataSize++; // Pad
		}
	}

	// Build chunk
	const chunk = new Uint8Array(8 + dataSize);
	const view = new DataView(chunk.buffer);

	// LIST header
	chunk.set([0x4c, 0x49, 0x53, 0x54]); // 'LIST'
	view.setUint32(4, dataSize, true);
	chunk.set([0x49, 0x4e, 0x46, 0x4f], 8); // 'INFO'

	let pos = 12;
	for (const entry of entries) {
		const valueBytes = new TextEncoder().encode(`${entry.value}\0`);

		// Subchunk ID
		chunk.set(new TextEncoder().encode(entry.id), pos);
		pos += 4;

		// Subchunk size
		view.setUint32(pos, valueBytes.length, true);
		pos += 4;

		// Value
		chunk.set(valueBytes, pos);
		pos += valueBytes.length;

		// Pad byte
		if (valueBytes.length % 2 === 1) {
			chunk[pos] = 0;
			pos++;
		}
	}

	return chunk;
}

/**
 * Sign WAV file with elaraSign metadata
 */
async function signWav(data: Uint8Array, metadata: AudioSigningMetadata, signatureHash: string): Promise<Uint8Array> {
	// Build INFO chunk
	const infoChunk = buildWavInfoChunk(metadata, signatureHash);

	// Find existing INFO chunk
	const existingInfo = findWavInfoChunk(data);

	if (existingInfo) {
		// Replace existing INFO chunk
		const before = data.slice(0, existingInfo.start);
		const after = data.slice(existingInfo.start + existingInfo.size);

		const result = new Uint8Array(before.length + infoChunk.length + after.length);
		result.set(before);
		result.set(infoChunk, before.length);
		result.set(after, before.length + infoChunk.length);

		// Update RIFF size
		const view = new DataView(result.buffer);
		view.setUint32(4, result.length - 8, true);

		return result;
	}

	// Append INFO chunk before any existing chunks at end
	// For simplicity, just append to end and update RIFF size
	const result = new Uint8Array(data.length + infoChunk.length);
	result.set(data);
	result.set(infoChunk, data.length);

	// Update RIFF size
	const view = new DataView(result.buffer);
	view.setUint32(4, result.length - 8, true);

	return result;
}

// ============================================================================
// MP3 SIGNING (ID3v2)
// ============================================================================

/**
 * Check if MP3 has ID3v2 tag
 */
function hasId3v2(data: Uint8Array): boolean {
	return data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33;
}

/**
 * Get ID3v2 tag size
 */
function getId3v2Size(data: Uint8Array): number {
	if (!hasId3v2(data)) {
		return 0;
	}

	// Size is syncsafe integer at bytes 6-9
	const size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9];
	return size + 10; // +10 for header
}

/**
 * Build minimal ID3v2.3 tag with elaraSign metadata
 */
function buildId3v2Tag(metadata: AudioSigningMetadata, signatureHash: string): Uint8Array {
	const frames: Uint8Array[] = [];

	// TXXX frame (user-defined): elaraSign payload
	const payload = buildElaraComment(metadata, signatureHash);
	const txxxFrame = buildId3TextFrame("TXXX", `elaraSign\0${payload}`);
	frames.push(txxxFrame);

	// TSSE frame: Software
	const tsseFrame = buildId3TextFrame("TSSE", "elaraSign v2.0 - openElaraUniverse");
	frames.push(tsseFrame);

	// COMM frame: Comment
	const commFrame = buildId3CommentFrame(`Signed by elaraSign | ${signatureHash.slice(0, 16)}`);
	frames.push(commFrame);

	// Calculate total frame size
	let framesSize = 0;
	for (const frame of frames) {
		framesSize += frame.length;
	}

	// Build ID3v2.3 header + frames
	const tag = new Uint8Array(10 + framesSize);

	// Header
	tag[0] = 0x49; // 'I'
	tag[1] = 0x44; // 'D'
	tag[2] = 0x33; // '3'
	tag[3] = 0x03; // Version 2.3
	tag[4] = 0x00; // Revision 0
	tag[5] = 0x00; // Flags

	// Size (syncsafe integer)
	const size = framesSize;
	tag[6] = (size >> 21) & 0x7f;
	tag[7] = (size >> 14) & 0x7f;
	tag[8] = (size >> 7) & 0x7f;
	tag[9] = size & 0x7f;

	// Frames
	let pos = 10;
	for (const frame of frames) {
		tag.set(frame, pos);
		pos += frame.length;
	}

	return tag;
}

/**
 * Build ID3v2.3 text frame
 */
function buildId3TextFrame(id: string, text: string): Uint8Array {
	const textBytes = new TextEncoder().encode(text);
	const frameSize = 1 + textBytes.length; // 1 byte encoding + text

	const frame = new Uint8Array(10 + frameSize);

	// Frame ID
	frame.set(new TextEncoder().encode(id), 0);

	// Frame size (big-endian)
	frame[4] = (frameSize >> 24) & 0xff;
	frame[5] = (frameSize >> 16) & 0xff;
	frame[6] = (frameSize >> 8) & 0xff;
	frame[7] = frameSize & 0xff;

	// Flags
	frame[8] = 0x00;
	frame[9] = 0x00;

	// Text encoding (0 = ISO-8859-1)
	frame[10] = 0x00;

	// Text
	frame.set(textBytes, 11);

	return frame;
}

/**
 * Build ID3v2.3 COMM (comment) frame
 */
function buildId3CommentFrame(comment: string): Uint8Array {
	const commentBytes = new TextEncoder().encode(comment);
	const frameSize = 1 + 3 + 1 + commentBytes.length; // encoding + lang + null + text

	const frame = new Uint8Array(10 + frameSize);

	// Frame ID
	frame.set(new TextEncoder().encode("COMM"), 0);

	// Frame size
	frame[4] = (frameSize >> 24) & 0xff;
	frame[5] = (frameSize >> 16) & 0xff;
	frame[6] = (frameSize >> 8) & 0xff;
	frame[7] = frameSize & 0xff;

	// Flags
	frame[8] = 0x00;
	frame[9] = 0x00;

	// Encoding
	frame[10] = 0x00;

	// Language (eng)
	frame[11] = 0x65; // 'e'
	frame[12] = 0x6e; // 'n'
	frame[13] = 0x67; // 'g'

	// Short content description (null)
	frame[14] = 0x00;

	// Comment text
	frame.set(commentBytes, 15);

	return frame;
}

/**
 * Sign MP3 file with elaraSign metadata
 */
async function signMp3(data: Uint8Array, metadata: AudioSigningMetadata, signatureHash: string): Promise<Uint8Array> {
	const newTag = buildId3v2Tag(metadata, signatureHash);

	if (hasId3v2(data)) {
		// Replace existing ID3v2 tag
		const existingSize = getId3v2Size(data);
		const audioData = data.slice(existingSize);

		const result = new Uint8Array(newTag.length + audioData.length);
		result.set(newTag);
		result.set(audioData, newTag.length);

		return result;
	}

	// Prepend new ID3v2 tag
	const result = new Uint8Array(newTag.length + data.length);
	result.set(newTag);
	result.set(data, newTag.length);

	return result;
}

// ============================================================================
// GENERIC TRAILER SIGNING (Fallback)
// ============================================================================

/**
 * Sign any audio format by appending trailer comment
 * This is a fallback for unsupported formats
 */
async function signWithTrailer(
	data: Uint8Array,
	metadata: AudioSigningMetadata,
	signatureHash: string,
): Promise<Uint8Array> {
	const trailer = `\n${ELARA_AUDIO_MARKER}|${signatureHash}|${metadata.method}|${metadata.generator}|${metadata.generatedAt}|${metadata.userFingerprint}\n`;
	const trailerBytes = new TextEncoder().encode(trailer);

	const result = new Uint8Array(data.length + trailerBytes.length);
	result.set(data);
	result.set(trailerBytes, data.length);

	return result;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Sign an audio file with elaraSign provenance metadata
 *
 * Supports: MP3 (ID3v2), WAV (INFO chunk), others (trailer fallback)
 *
 * @param audioBytes - Original audio file bytes
 * @param metadata - Signing metadata
 * @returns Signed audio with embedded provenance
 */
export async function signAudio(audioBytes: Uint8Array, metadata: AudioSigningMetadata): Promise<AudioSigningResult> {
	const format = detectAudioFormat(audioBytes);

	// Compute hashes
	const contentHash = await sha256(audioBytes);
	const { metaHash, signatureHash } = await generateSignatureHash(contentHash, metadata);

	let signedAudio: Uint8Array;
	let embeddingMethod: AudioSigningResult["embeddingMethod"];

	switch (format) {
		case "mp3":
			signedAudio = await signMp3(audioBytes, metadata, signatureHash);
			embeddingMethod = "id3";
			break;

		case "wav":
			signedAudio = await signWav(audioBytes, metadata, signatureHash);
			embeddingMethod = "info-chunk";
			break;

		case "flac":
		case "ogg":
			// TODO: Implement Vorbis comment signing
			// For now, use trailer
			signedAudio = await signWithTrailer(audioBytes, metadata, signatureHash);
			embeddingMethod = "trailer";
			break;

		default:
			// Fallback: append trailer
			signedAudio = await signWithTrailer(audioBytes, metadata, signatureHash);
			embeddingMethod = "trailer";
	}

	return {
		signedAudio,
		format,
		contentHash,
		metaHash,
		signatureHash,
		metadata,
		embeddingMethod,
	};
}

/**
 * Verify elaraSign metadata in an audio file
 *
 * @param audioBytes - Audio to verify
 * @returns Verification result
 */
export async function verifyAudio(audioBytes: Uint8Array): Promise<AudioVerificationResult> {
	const format = detectAudioFormat(audioBytes);
	const result: AudioVerificationResult = {
		isSigned: false,
		format,
	};

	try {
		// Try to find elaraSign marker in various ways
		const text = new TextDecoder("latin1").decode(audioBytes);

		// Check for JSON payload
		const jsonMatch = text.match(/"_elaraSign"\s*:\s*"elaraSign-v2\.0-audio"/);
		if (jsonMatch) {
			result.isSigned = true;

			// Try to extract full JSON
			const payloadMatch = text.match(/\{[^}]*"_elaraSign"\s*:\s*"elaraSign-v2\.0-audio"[^}]*\}/);
			if (payloadMatch) {
				try {
					const payload = JSON.parse(payloadMatch[0]);
					result.signatureHash = payload.sig;
					result.metadata = {
						method: payload.method,
						generator: payload.generator,
						model: payload.model,
						generatedAt: payload.timestamp,
						userFingerprint: payload.fingerprint,
						voiceModel: payload.voice,
						characterId: payload.character,
					};
				} catch {
					// JSON parse failed, but we know it's signed
				}
			}
		}

		// Check for trailer format
		const trailerMatch = text.match(/elaraSign-v2\.0-audio\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\n]+)/);
		if (trailerMatch) {
			result.isSigned = true;
			result.signatureHash = trailerMatch[1];
			result.metadata = {
				method: trailerMatch[2] as GenerationMethod,
				generator: trailerMatch[3],
				generatedAt: trailerMatch[4],
				userFingerprint: trailerMatch[5],
			};
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : "Unknown error";
	}

	return result;
}

/**
 * Quick check if audio has elaraSign metadata
 */
export async function hasAudioSignature(audioBytes: Uint8Array): Promise<boolean> {
	const text = new TextDecoder("latin1").decode(audioBytes);
	return text.includes(ELARA_AUDIO_MARKER) || text.includes('"_elaraSign"');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
	signAudio,
	verifyAudio,
	hasAudioSignature,
	detectAudioFormat,
	sha256,
	generateSignatureHash,
	ELARA_AUDIO_MARKER,
};
