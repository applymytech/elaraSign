/**
 * Verify Route - POST /api/verify
 *
 * Accepts any image or PDF file and verifies its elaraSign signature.
 */

import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { verifyImageContent, readSignature, hasElaraSignature } from '../../core/signing-core.js';
import { verifyPdfSignature } from './sign.js';

const router = Router();

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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

router.post('/verify', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { mimetype, buffer } = req.file;

    // Handle PDF
    if (mimetype === 'application/pdf') {
      const pdfResult = verifyPdfSignature(buffer);
      
      if (!pdfResult.signed) {
        return res.json({
          type: 'pdf',
          signed: false,
          message: 'No elaraSign signature detected in PDF',
        });
      }

      return res.json({
        type: 'pdf',
        signed: true,
        verified: true, // PDF signatures are verified by presence (no pixel content hash)
        signature: {
          version: pdfResult.version,
          metaHash: pdfResult.metaHash,
          generator: pdfResult.generator,
          timestamp: pdfResult.timestamp,
        },
        message: 'elaraSign signature found in PDF',
      });
    }

    // Handle images via sharp
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

    // Quick check
    const hasSig = hasElaraSignature(imageData, width, height);
    
    if (!hasSig) {
      return res.json({
        type: 'image',
        format: mimetype,
        signed: false,
        message: 'No elaraSign signature detected',
        note: mimetype === 'image/jpeg' 
          ? 'JPEG compression may have degraded the signature if one was present'
          : undefined,
      });
    }

    // Read signature details
    const sigInfo = readSignature(imageData, width, height);
    
    // Verify integrity
    const verification = await verifyImageContent(imageData, width, height);

    return res.json({
      type: 'image',
      format: mimetype,
      signed: true,
      verified: verification.isValid,
      tampered: verification.tamperDetected,
      signature: {
        version: sigInfo.version,
        timestamp: sigInfo.timestamp,
        metaHash: sigInfo.metaHash,
        validLocations: sigInfo.validLocations,
      },
      dimensions: { width, height },
      message: verification.isValid 
        ? 'Signature valid - image has not been tampered with'
        : verification.tamperDetected 
          ? 'WARNING: Image may have been tampered with'
          : 'Signature found but could not verify integrity',
    });
  } catch (error) {
    console.error('Verify error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

export { router as verifyRoutes };
