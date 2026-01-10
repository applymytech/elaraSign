/**
 * elaraSign - Universal File Signing Library
 *
 * The canonical implementation of the Elara signing standard.
 */

// Core signing functionality
export {
  signImageContent,
  verifyImageContent,
  extractMultiLocationSignature,
  hasElaraSignature,
  hasAnyElaraSignature,
  readSignature,
  createMetadata,
  ELARA_MARKER,
  ELARA_VERSION,
  SIGNATURE_LOCATIONS,
} from './core/signing-core.js';
