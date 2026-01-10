/**
 * Download Routes - GET /api/download/:id, GET /api/sidecar/:id
 *
 * Downloads signed file or sidecar JSON.
 * Files are deleted after successful download.
 */

import { Router } from 'express';
import { getSession, markDownloaded, deleteSession } from '../storage/session-manager.js';

const router = Router();

router.get('/download/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Mark as downloaded (triggers cleanup)
    await markDownloaded(sessionId);

    // Determine content type and extension
    const mimeType = session.mimeType || 'image/png';
    const ext = mimeType === 'application/pdf' ? 'pdf' 
      : mimeType === 'image/jpeg' ? 'jpg'
      : mimeType === 'image/webp' ? 'webp'
      : mimeType === 'image/tiff' ? 'tiff'
      : 'png';
    
    const filename = session.originalName.replace(/\.[^.]+$/, `-signed.${ext}`);
    
    // Set headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Elara-Signature', session.signature.metaHash);
    
    if (mimeType !== 'application/pdf') {
      res.setHeader('X-Elara-Sidecar-Url', `/api/sidecar/${sessionId}`);
    }

    // Send file
    res.send(session.signedImage);

    // Schedule deletion (give time for sidecar download)
    setTimeout(() => deleteSession(sessionId), 60000);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sidecar/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${session.originalName.replace(/\.[^.]+$/, '-sidecar.json')}"`
    );

    return res.json(session.sidecar);
  } catch (error) {
    console.error('Sidecar error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as downloadRoutes };
