#!/usr/bin/env npx tsx
/**
 * Generate Master Key
 * ====================
 *
 * ONE-TIME KEY GENERATION for forensic accountability.
 *
 * ⚠️  WARNING: THIS KEY IS SHOWN ONCE. SAVE IT SECURELY. DO NOT LOSE IT.
 *
 * Usage:
 *   npx tsx scripts/generate-master-key.ts
 *
 * The key should be:
 * - Printed on paper and stored in a safe
 * - Saved in a password manager
 * - NEVER committed to git
 * - NEVER stored in the cloud service
 * - Only used when authorities request forensic decryption
 */

import { generateMasterKey } from "../src/core/forensic-crypto.js";

console.log("");
console.log("═══════════════════════════════════════════════════════════════════");
console.log("              elaraSign MASTER KEY GENERATOR                        ");
console.log("═══════════════════════════════════════════════════════════════════");
console.log("");
console.log("This key enables decryption of accountability data embedded in");
console.log("every signed image. Without it, the data is unrecoverable.");
console.log("");
console.log("╔═══════════════════════════════════════════════════════════════════╗");
console.log("║  ⚠️  THIS KEY IS SHOWN ONCE. COPY IT NOW. DO NOT LOSE IT.        ║");
console.log("╚═══════════════════════════════════════════════════════════════════╝");
console.log("");

const masterKey = generateMasterKey();

console.log("YOUR MASTER KEY:");
console.log("");
console.log(`  ${masterKey}`);
console.log("");
console.log("───────────────────────────────────────────────────────────────────");
console.log("");
console.log("STORAGE RECOMMENDATIONS:");
console.log("  1. Print this key and store in a physical safe");
console.log("  2. Save in a secure password manager (e.g., 1Password, Bitwarden)");
console.log("  3. Consider splitting: half in safe, half in password manager");
console.log("");
console.log("DO NOT:");
console.log("  ❌ Commit this key to git");
console.log("  ❌ Store in environment variables on the server");
console.log("  ❌ Share with anyone who doesn't need forensic access");
console.log("  ❌ Store in Google Secret Manager (defeats the purpose)");
console.log("");
console.log("USAGE SCENARIO:");
console.log('  Authorities: "We found illegal content with your watermark."');
console.log('  You: "I\'ll decrypt it with my master key." (provide key offline)');
console.log("");
console.log("───────────────────────────────────────────────────────────────────");
console.log("");
console.log("To decrypt an image later, use:");
console.log("  npx tsx scripts/forensic-decrypt.ts --image suspicious.png --key <YOUR_KEY>");
console.log("");
