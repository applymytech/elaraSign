/**
 * elaraSign Cloud Server
 *
 * Public API for signing files with provenance metadata.
 * Files are stored temporarily and auto-deleted after download or timeout.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { signRoutes } from './routes/sign.js';
import { verifyRoutes } from './routes/verify.js';
import { downloadRoutes } from './routes/download.js';
import { sessionCleanup } from './storage/session-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3010;

// Middleware
app.use(express.json());

// Serve static demo page
app.use(express.static(path.join(__dirname, '../../web')));

// Demo page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../web/index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api', signRoutes);
app.use('/api', verifyRoutes);
app.use('/api', downloadRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🔐 elaraSign server running on http://localhost:${PORT}`);

  // Start session cleanup job
  sessionCleanup.start();
});

export { app };
