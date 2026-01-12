/**
 * Build Fingerprint System
 * =========================
 *
 * Prevents impersonation by embedding a cryptographic build ID in every signature.
 *
 * Each official build has a unique fingerprint derived from:
 * - Package version
 * - Build timestamp
 * - Build secret (generated at build time)
 *
 * If someone copies the code but doesn't have our build secret,
 * their signatures will have a different (or no) build fingerprint.
 *
 * @author OpenElara Project
 * @license MIT
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// TYPES
// ============================================================================

export interface BuildInfo {
	/** Unique build fingerprint (16 chars hex) */
	fingerprint: string;

	/** Package version */
	version: string;

	/** Build timestamp (ISO 8601) */
	buildTime: string;

	/** Build environment */
	environment: "production" | "development" | "test";

	/** Git commit hash (if available) */
	gitCommit?: string;
}

// ============================================================================
// BUILD INFO FILE
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_INFO_PATH = join(__dirname, "..", "..", "build-info.json");
const PACKAGE_JSON_PATH = join(__dirname, "..", "..", "package.json");

/**
 * Load current build info (or generate if missing)
 */
export function getBuildInfo(): BuildInfo {
	// Try to load existing build info
	if (existsSync(BUILD_INFO_PATH)) {
		try {
			const data = readFileSync(BUILD_INFO_PATH, "utf-8");
			return JSON.parse(data) as BuildInfo;
		} catch {
			// Fall through to generate new
		}
	}

	// Generate development build info
	return generateBuildInfo("development");
}

/**
 * Generate new build info (called during build/deploy)
 */
export function generateBuildInfo(environment: BuildInfo["environment"] = "production"): BuildInfo {
	// Read package.json for version
	let version = "0.0.0";
	try {
		const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
		version = pkg.version || "0.0.0";
	} catch {
		// Use default
	}

	// Generate unique build secret
	const buildSecret = randomBytes(32).toString("hex");
	const buildTime = new Date().toISOString();

	// Create fingerprint from version + time + secret
	const fingerprint = createHash("sha256")
		.update(`elarasign:${version}:${buildTime}:${buildSecret}`)
		.digest("hex")
		.substring(0, 16);

	// Try to get git commit
	let gitCommit: string | undefined;
	try {
		const { execSync } = require("node:child_process");
		gitCommit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
	} catch {
		// Git not available
	}

	const info: BuildInfo = {
		fingerprint,
		version,
		buildTime,
		environment,
		gitCommit,
	};

	return info;
}

/**
 * Save build info to file (called during build process)
 */
export function saveBuildInfo(info: BuildInfo): void {
	writeFileSync(BUILD_INFO_PATH, JSON.stringify(info, null, 2));
}

/**
 * Get short build ID for display (8 chars)
 */
export function getShortBuildId(): string {
	const info = getBuildInfo();
	return info.fingerprint.substring(0, 8).toUpperCase();
}

/**
 * Verify a build fingerprint matches this build
 */
export function verifyBuildFingerprint(fingerprint: string): boolean {
	const info = getBuildInfo();
	return info.fingerprint === fingerprint;
}
