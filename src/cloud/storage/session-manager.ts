/**
 * Session Manager
 *
 * Manages temporary storage of signed files.
 * Sessions expire after timeout or after download.
 *
 * Key Principle: "Borrowed Storage"
 * - Cloud storage is temporary workspace, not permanent storage
 * - Files auto-delete after timeout (default 15 minutes)
 * - Files delete immediately after successful download
 * - The download IS the original (not a copy)
 */

import crypto from 'node:crypto';

interface Session {
  id: string;
  signedImage: Buffer;
  originalName: string;
  mimeType: string;
  signature: {
    metaHash: string;
    locations: string[];
    timestamp: string;
  };
  metadata: object;
  sidecar: object;
  createdAt: Date;
  expiresAt: Date;
  downloaded: boolean;
}

// In-memory storage (use Redis/DB in production)
const sessions = new Map<string, Session>();

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function createSession(data: {
  signedImage: Buffer;
  originalName: string;
  mimeType?: string;
  signature: { metaHash: string; locations: string[]; timestamp: string };
  metadata: object;
  sidecar?: object; // Optional: use enhanced sidecar from standard-metadata.ts
}): Promise<Session> {
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date();

  // Use provided sidecar or build a basic one from metadata and signature
  const sidecar = data.sidecar || {
    elaraSign: {
      version: '2.0',
      ...data.signature,
    },
    metadata: data.metadata,
    signedAt: data.signature.timestamp,
  };

  const session: Session = {
    id,
    signedImage: data.signedImage,
    originalName: data.originalName,
    mimeType: data.mimeType || 'image/png',
    signature: data.signature,
    metadata: data.metadata,
    sidecar,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TIMEOUT_MS),
    downloaded: false,
  };

  sessions.set(id, session);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const session = sessions.get(id);

  if (!session) {
    return null;
  }

  // Check if expired
  if (new Date() > session.expiresAt) {
    sessions.delete(id);
    return null;
  }

  return session;
}

export async function markDownloaded(id: string): Promise<void> {
  const session = sessions.get(id);
  if (session) {
    session.downloaded = true;
  }
}

export async function deleteSession(id: string): Promise<void> {
  sessions.delete(id);
}

// Cleanup job
export const sessionCleanup = {
  interval: null as NodeJS.Timeout | null,

  start(intervalMs = 60000) {
    this.interval = setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      for (const [id, session] of sessions.entries()) {
        if (now > session.expiresAt) {
          sessions.delete(id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired sessions`);
      }
    }, intervalMs);
  },

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  },
};
