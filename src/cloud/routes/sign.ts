/**
 * Sign Route - POST /api/sign
 *
 * Accepts any image or PDF file, signs it with elaraSign v2.0.
 * - Images: JPG, PNG, WebP, GIF, BMP, TIFF → signed and returned in same format (or PNG)
 * - PDFs: Metadata embedded in PDF info dictionary
 */

import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import zlib from 'node:zlib';
import { 
  signImageContent, 
  sha256Hex, 
  createUserFingerprint, 
  createPromptHash,
  type ElaraContentMetadata 
} from '../../core/signing-core.js';
import { createSession } from '../storage/session-manager.js';

const router = Router();

// ============================================================================
// PNG TEXT CHUNK INJECTION
// ============================================================================

/**
 * Calculate CRC32 for PNG chunk validation
 */
function crc32Png(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Create a PNG tEXt chunk
 */
function createPngTextChunk(keyword: string, text: string): Buffer {
  const keywordBytes = Buffer.from(keyword, 'latin1');
  const textBytes = Buffer.from(text, 'latin1');
  const nullSeparator = Buffer.from([0]);
  
  const chunkData = Buffer.concat([keywordBytes, nullSeparator, textBytes]);
  const chunkType = Buffer.from('tEXt', 'ascii');
  
  // Length (4 bytes) + Type (4 bytes) + Data + CRC (4 bytes)
  const length = Buffer.alloc(4);
  length.writeUInt32BE(chunkData.length, 0);
  
  const crcData = Buffer.concat([chunkType, chunkData]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Png(crcData), 0);
  
  return Buffer.concat([length, chunkType, chunkData, crc]);
}

/**
 * Create a PNG zTXt chunk (compressed text - for longer data)
 */
function createPngZtxtChunk(keyword: string, text: string): Buffer {
  const keywordBytes = Buffer.from(keyword, 'latin1');
  const nullSeparator = Buffer.from([0]);
  const compressionMethod = Buffer.from([0]); // 0 = deflate
  const compressedText = zlib.deflateSync(Buffer.from(text, 'utf8'));
  
  const chunkData = Buffer.concat([keywordBytes, nullSeparator, compressionMethod, compressedText]);
  const chunkType = Buffer.from('zTXt', 'ascii');
  
  const length = Buffer.alloc(4);
  length.writeUInt32BE(chunkData.length, 0);
  
  const crcData = Buffer.concat([chunkType, chunkData]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Png(crcData), 0);
  
  return Buffer.concat([length, chunkType, chunkData, crc]);
}

/**
 * Inject tEXt and zTXt chunks into a PNG buffer
 * Inserts after IHDR chunk (required to be first after signature)
 */
function injectPngTextChunks(pngBuffer: Buffer, textChunks: Record<string, string>): Buffer {
  // PNG signature is 8 bytes
  const PNG_SIGNATURE_LENGTH = 8;
  
  // Find end of IHDR chunk (must be first chunk after signature)
  // IHDR is always 13 bytes of data, so chunk is: 4 (length) + 4 (type) + 13 (data) + 4 (crc) = 25 bytes
  const ihdrEnd = PNG_SIGNATURE_LENGTH + 25;
  
  // Build text chunks
  const chunks: Buffer[] = [];
  for (const [keyword, text] of Object.entries(textChunks)) {
    if (text.length > 1000) {
      // Use compressed chunk for long text
      chunks.push(createPngZtxtChunk(keyword, text));
    } else {
      chunks.push(createPngTextChunk(keyword, text));
    }
  }
  
  const textChunksBuffer = Buffer.concat(chunks);
  
  // Reconstruct PNG: signature + IHDR + text chunks + rest
  return Buffer.concat([
    pngBuffer.subarray(0, ihdrEnd),
    textChunksBuffer,
    pngBuffer.subarray(ihdrEnd),
  ]);
}

// Accept common image formats and PDF
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/pdf',
];

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported: PNG, JPG, WebP, GIF, BMP, TIFF, PDF`));
    }
  }
});

/**
 * Create metadata object with proper required fields for v2.0
 */
async function buildMetadata(
  contentBuffer: Buffer,
  options: {
    generator?: string;
    model?: string;
    prompt?: string;
    userId?: string;
    seed?: number;
  }
): Promise<ElaraContentMetadata> {
  const contentHash = await sha256Hex(contentBuffer);
  const userFingerprint = options.userId 
    ? await createUserFingerprint(options.userId)
    : await sha256Hex(`elara:anonymous:${Date.now()}`);
  const promptHash = options.prompt 
    ? await createPromptHash(options.prompt)
    : await sha256Hex('elara:no-prompt');
  
  return {
    signatureVersion: '2.0',
    generator: options.generator || 'elara.sign.cloud',
    generatedAt: new Date().toISOString(),
    userFingerprint,
    keyFingerprint: 'cloud-public', // Cloud service uses a public key identifier
    contentType: 'image',
    contentHash,
    characterId: 'elara-sign-service',
    modelUsed: options.model || 'unknown',
    promptHash,
    seed: options.seed,
  };
}

/**
 * Sign a PDF by embedding metadata in the file
 * Embeds signature in PDF info dictionary and as a comment
 */
async function signPdf(
  pdfBuffer: Buffer, 
  metadata: ElaraContentMetadata
): Promise<{ signedBuffer: Buffer; metaHash: string }> {
  const metaHash = await sha256Hex(JSON.stringify(metadata));
  const timestamp = new Date().toISOString();
  
  // Create signature block
  const signatureBlock = [
    `%% ELARA_SIGN_START`,
    `%% Version: 2.0`,
    `%% MetaHash: ${metaHash}`,
    `%% Generator: ${metadata.generator}`,
    `%% Timestamp: ${timestamp}`,
    `%% ELARA_SIGN_END`,
    '',
  ].join('\n');
  
  // Find where to insert (after PDF header, before first object)
  const pdfString = pdfBuffer.toString('latin1');
  const headerEnd = pdfString.indexOf('\n', pdfString.indexOf('%PDF-')) + 1;
  
  // Insert signature block after header
  const signedPdf = 
    pdfString.slice(0, headerEnd) + 
    signatureBlock + 
    pdfString.slice(headerEnd);
  
  return {
    signedBuffer: Buffer.from(signedPdf, 'latin1'),
    metaHash,
  };
}

/**
 * Verify if a PDF has elaraSign signature
 */
function verifyPdfSignature(pdfBuffer: Buffer): { 
  signed: boolean; 
  metaHash?: string; 
  version?: string;
  generator?: string;
  timestamp?: string;
} {
  const pdfString = pdfBuffer.toString('latin1');
  
  if (!pdfString.includes('ELARA_SIGN_START')) {
    return { signed: false };
  }
  
  const metaHashMatch = pdfString.match(/%% MetaHash: ([a-f0-9]+)/);
  const versionMatch = pdfString.match(/%% Version: ([\d.]+)/);
  const generatorMatch = pdfString.match(/%% Generator: ([^\n]+)/);
  const timestampMatch = pdfString.match(/%% Timestamp: ([^\n]+)/);
  
  return {
    signed: true,
    metaHash: metaHashMatch?.[1],
    version: versionMatch?.[1],
    generator: generatorMatch?.[1]?.trim(),
    timestamp: timestampMatch?.[1]?.trim(),
  };
}

router.post('/sign', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { mimetype, buffer, originalname } = req.file;
    const outputFormat = req.body.outputFormat || 'same'; // 'same' or 'png'
    
    // Build metadata with proper required fields
    const metadata = await buildMetadata(buffer, {
      generator: req.body.generator,
      model: req.body.model,
      prompt: req.body.prompt,
      userId: req.body.userId,
      seed: req.body.seed ? parseInt(req.body.seed) : undefined,
    });

    // Handle PDF separately
    if (mimetype === 'application/pdf') {
      const { signedBuffer, metaHash } = await signPdf(buffer, metadata);
      
      const session = await createSession({
        signedImage: signedBuffer,
        originalName: originalname,
        signature: {
          metaHash,
          locations: ['pdf-header'],
          timestamp: new Date().toISOString(),
        },
        metadata,
        mimeType: 'application/pdf',
      });

      return res.json({
        success: true,
        type: 'pdf',
        sessionId: session.id,
        downloadUrl: `/api/download/${session.id}`,
        signature: {
          metaHash,
          locations: ['pdf-header'],
          version: '2.0',
        },
        expiresIn: '10 minutes',
      });
    }

    // Handle images - convert to raw pixels via sharp
    const image = sharp(buffer);
    const imageMetadata = await image.metadata();
    const { width, height } = imageMetadata;
    
    if (!width || !height) {
      return res.status(400).json({ error: 'Could not read image dimensions' });
    }

    // Get raw RGBA pixel data
    const rawBuffer = await image
      .ensureAlpha()
      .raw()
      .toBuffer();
    
    const imageData = new Uint8ClampedArray(rawBuffer);

    // Sign the image (embeds steganographic signature in pixel data)
    const result = await signImageContent(imageData, width, height, metadata);

    // Determine output format
    let outputMime = mimetype;
    let outputBuffer: Buffer;
    let outputExt = originalname.split('.').pop() || 'png';

    // Create sharp instance from signed raw pixel data
    const signedImage = sharp(Buffer.from(result.signedImageData), {
      raw: { width, height, channels: 4 }
    });

    // PNG text chunks for metadata (PNG-specific, survives most processing)
    const pngTextChunks = {
      'Software': 'elaraSign v2.0',
      'Comment': JSON.stringify({
        elaraSign: {
          version: '2.0',
          metaHash: result.metaHash,
          locations: result.locationsEmbedded,
          timestamp: new Date().toISOString(),
        },
        generator: metadata.generator,
        model: metadata.modelUsed,
      }),
      'Description': 'AI-generated content signed with elaraSign',
      'Author': metadata.generator,
      'Source': 'elaraSign - https://sign.openelara.com',
    };

    if (outputFormat === 'png' || mimetype === 'image/png') {
      outputBuffer = await signedImage
        .png({ compressionLevel: 9 })
        .toBuffer();
      
      // Inject PNG tEXt chunks (this is what will show in Windows/tools)
      outputBuffer = injectPngTextChunks(outputBuffer, pngTextChunks);
      outputMime = 'image/png';
      outputExt = 'png';
    } else if (mimetype === 'image/jpeg') {
      // JPEG is lossy - signature may degrade, warn user
      // Note: JPEG doesn't support tEXt chunks, would need EXIF library
      outputBuffer = await signedImage
        .jpeg({ quality: 100 })
        .toBuffer();
      outputMime = 'image/jpeg';
    } else if (mimetype === 'image/webp') {
      outputBuffer = await signedImage
        .webp({ lossless: true })
        .toBuffer();
      outputMime = 'image/webp';
    } else if (mimetype === 'image/gif') {
      // GIF conversion - use PNG for signed output (GIF doesn't preserve well)
      outputBuffer = await signedImage
        .png()
        .toBuffer();
      outputBuffer = injectPngTextChunks(outputBuffer, pngTextChunks);
      outputMime = 'image/png';
      outputExt = 'png';
    } else if (mimetype === 'image/tiff') {
      outputBuffer = await signedImage
        .tiff()
        .toBuffer();
      outputMime = 'image/tiff';
    } else {
      // Default to PNG
      outputBuffer = await signedImage
        .png()
        .toBuffer();
      outputBuffer = injectPngTextChunks(outputBuffer, pngTextChunks);
      outputMime = 'image/png';
      outputExt = 'png';
    }

    // Create session for download
    const session = await createSession({
      signedImage: outputBuffer,
      originalName: originalname.replace(/\.[^.]+$/, `-signed.${outputExt}`),
      signature: {
        metaHash: result.metaHash,
        locations: result.locationsEmbedded,
        timestamp: new Date().toISOString(),
      },
      metadata,
      mimeType: outputMime,
    });

    return res.json({
      success: true,
      type: 'image',
      format: outputMime,
      sessionId: session.id,
      downloadUrl: `/api/download/${session.id}`,
      sidecarUrl: `/api/sidecar/${session.id}`,
      signature: {
        metaHash: result.metaHash,
        locations: result.locationsEmbedded,
        version: '2.0',
      },
      dimensions: { width, height },
      warning: mimetype === 'image/jpeg' 
        ? 'JPEG is lossy - signature may degrade if image is re-saved. PNG recommended.'
        : undefined,
      expiresIn: '10 minutes',
    });
  } catch (error) {
    console.error('Sign error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Export PDF verification for verify route
export { verifyPdfSignature };
export { router as signRoutes };
