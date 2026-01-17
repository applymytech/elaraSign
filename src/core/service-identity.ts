/**
 * elaraSign Service Identity Module
 * ==================================
 *
 * Manages the SERVICE-LEVEL identity for elaraSign as a witness.
 *
 * THE WITNESS MODEL:
 * - elaraSign doesn't sign AS the user
 * - elaraSign signs as a WITNESS to the user's request
 * - The service certificate proves WHICH service witnessed the event
 *
 * THREE LAYERS OF IDENTITY:
 * 1. SERVICE: Who witnessed (this module - certificate from Secret Manager)
 * 2. DEPLOY: When the witness was deployed
 * 3. SIGNER: Who requested the signature (from request body)
 *
 * CERTIFICATE STORAGE (production):
 * - P12 certificate stored in Google Secret Manager
 * - Password stored in separate secret
 * - Auto-generated on first deploy if not exists
 *
 * @author OpenElara Project
 * @license MIT
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCurrentRegionInfo, type RegionInfo } from "./region-mapping.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// TYPES
// ============================================================================

/**
 * Service identity configuration (from deploy.config.json)
 */
export interface ServiceIdentityConfig {
	/** Organization name for certificate CN */
	organizationName: string;

	/** Service contact email */
	serviceEmail: string;

	/** Public service URL */
	serviceUrl: string;

	/** Service display name */
	serviceName: string;
}

/**
 * Deploy instance info (captured at startup)
 */
export interface DeployInstanceInfo {
	/** When this instance was deployed */
	deployedAt: string;

	/** Cloud Run revision (if on Cloud Run) */
	cloudRunRevision?: string;

	/** Node.js version */
	nodeVersion: string;

	/** elaraSign version */
	serviceVersion: string;

	/** Region info (human-readable location) */
	region: RegionInfo;
}

/**
 * Full service identity (certificate + metadata)
 */
export interface ServiceIdentity {
	/** Service config */
	config: ServiceIdentityConfig;

	/** Deploy instance info */
	deploy: DeployInstanceInfo;

	/** P12 certificate buffer (if loaded) */
	p12Certificate?: Buffer;

	/** P12 password */
	p12Password?: string;

	/** Certificate fingerprint (SHA-256 of public cert) */
	certificateFingerprint?: string;

	/** Whether PKCS#7 signing is available */
	canSignPkcs7: boolean;
}

// ============================================================================
// SINGLETON STATE
// ============================================================================

let _serviceIdentity: ServiceIdentity | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load service identity from environment and config
 *
 * In production (Cloud Run):
 * - Reads P12 from ELARASIGN_P12_BASE64 env var (from Secret Manager)
 * - Reads password from ELARASIGN_P12_PASSWORD env var
 *
 * In development:
 * - Looks for local ./certs/service.p12 file
 * - Or generates a new self-signed cert
 */
export async function initServiceIdentity(): Promise<ServiceIdentity> {
	if (_serviceIdentity) {
		return _serviceIdentity;
	}

	// Load deploy config
	const config = loadServiceConfig();

	// Capture deploy instance info
	const deploy = captureDeployInfo();

	// Try to load P12 certificate
	const { p12Certificate, p12Password, certificateFingerprint } = await loadOrGenerateCertificate(config);

	_serviceIdentity = {
		config,
		deploy,
		p12Certificate,
		p12Password,
		certificateFingerprint,
		canSignPkcs7: !!p12Certificate && !!p12Password,
	};

	console.log(`🔐 Service Identity Initialized:`);
	console.log(`   Organization: ${config.organizationName}`);
	console.log(`   Service: ${config.serviceName} @ ${config.serviceUrl}`);
	console.log(`   Location: ${deploy.region.displayName}`);
	console.log(`   Deploy: ${deploy.deployedAt}`);
	console.log(`   PKCS#7 Signing: ${_serviceIdentity.canSignPkcs7 ? "✅ Enabled" : "⚠️ Metadata-only"}`);

	return _serviceIdentity;
}

/**
 * Get current service identity (must call init first)
 */
export function getServiceIdentity(): ServiceIdentity {
	if (!_serviceIdentity) {
		throw new Error("Service identity not initialized. Call initServiceIdentity() first.");
	}
	return _serviceIdentity;
}

// ============================================================================
// CONFIG LOADING
// ============================================================================

function loadServiceConfig(): ServiceIdentityConfig {
	// Try to load from deploy.config.json
	const configPath = path.resolve(__dirname, "../../../deploy.config.json");

	const config: ServiceIdentityConfig = {
		organizationName: "elaraSign Service",
		serviceEmail: "service@elarasign.org",
		serviceUrl: "https://sign.openelara.org",
		serviceName: "elaraSign",
	};

	if (fs.existsSync(configPath)) {
		try {
			const deployConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

			// Extract service identity from deploy config
			if (deployConfig.service?.domain) {
				config.serviceUrl = `https://${deployConfig.service.domain}`;
			}
			if (deployConfig.service?.name) {
				config.serviceName = deployConfig.service.name;
			}

			// New fields for witness identity
			if (deployConfig.identity) {
				config.organizationName = deployConfig.identity.organizationName || config.organizationName;
				config.serviceEmail = deployConfig.identity.serviceEmail || config.serviceEmail;
			}
		} catch (e) {
			console.warn("⚠️ Could not load deploy.config.json:", e);
		}
	}

	// Environment overrides
	config.organizationName = process.env.ELARASIGN_ORG_NAME || config.organizationName;
	config.serviceEmail = process.env.ELARASIGN_SERVICE_EMAIL || config.serviceEmail;
	config.serviceUrl = process.env.ELARASIGN_SERVICE_URL || config.serviceUrl;

	return config;
}

function captureDeployInfo(): DeployInstanceInfo {
	const packageJsonPath = path.resolve(__dirname, "../../../package.json");
	let serviceVersion = "2.0.0";

	if (fs.existsSync(packageJsonPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
			serviceVersion = pkg.version || serviceVersion;
		} catch {
			// Ignore
		}
	}

	// Get human-readable region info
	const region = getCurrentRegionInfo();

	return {
		deployedAt: new Date().toISOString(),
		cloudRunRevision: process.env.K_REVISION,
		nodeVersion: process.version,
		serviceVersion,
		region,
	};
}

// ============================================================================
// CERTIFICATE MANAGEMENT
// ============================================================================

async function loadOrGenerateCertificate(
	config: ServiceIdentityConfig,
): Promise<{ p12Certificate?: Buffer; p12Password?: string; certificateFingerprint?: string }> {
	// 1. Try environment variables (production - from Secret Manager)
	if (process.env.ELARASIGN_P12_BASE64 && process.env.ELARASIGN_P12_PASSWORD) {
		console.log("📜 Loading P12 certificate from environment (Secret Manager)");
		const p12Certificate = Buffer.from(process.env.ELARASIGN_P12_BASE64, "base64");
		const p12Password = process.env.ELARASIGN_P12_PASSWORD;
		const certificateFingerprint = crypto.createHash("sha256").update(p12Certificate).digest("hex").slice(0, 32);

		return { p12Certificate, p12Password, certificateFingerprint };
	}

	// 2. Try local file (development) - try multiple possible locations
	const possibleCertPaths = [
		path.join(process.cwd(), "certs", "service.p12"), // From project root
		path.resolve(__dirname, "../../../certs/service.p12"), // From src/core
		path.resolve(__dirname, "../../certs/service.p12"), // From src
		path.join(__dirname, "..", "..", "..", "certs", "service.p12"), // Alternative
		"certs/service.p12", // Relative to cwd
	];

	let localCertPath: string | null = null;
	let localPasswordPath: string | null = null;

	for (const certPath of possibleCertPaths) {
		const passPath = certPath.replace("service.p12", "service.password");
		if (fs.existsSync(certPath) && fs.existsSync(passPath)) {
			localCertPath = certPath;
			localPasswordPath = passPath;
			break;
		}
	}

	if (localCertPath && localPasswordPath) {
		console.log("📜 Loading P12 certificate from local file");
		const p12Certificate = fs.readFileSync(localCertPath);
		const p12Password = fs.readFileSync(localPasswordPath, "utf-8").trim();
		const certificateFingerprint = crypto.createHash("sha256").update(p12Certificate).digest("hex").slice(0, 32);

		return { p12Certificate, p12Password, certificateFingerprint };
	}

	// 3. Auto-generate for development (optional)
	if (process.env.ELARASIGN_AUTO_GENERATE_CERT === "true") {
		console.log("📜 Auto-generating self-signed P12 certificate for development");
		// Use default paths for auto-generation
		const defaultCertPath = path.join(process.cwd(), "certs", "service.p12");
		const defaultPasswordPath = path.join(process.cwd(), "certs", "service.password");
		return await generateAndSaveCertificate(config, defaultCertPath, defaultPasswordPath);
	}

	// 4. No certificate available - metadata-only signing
	console.log("⚠️ No P12 certificate found. PKCS#7 signing disabled.");
	console.log("   To enable: Set ELARASIGN_P12_BASE64 and ELARASIGN_P12_PASSWORD env vars");
	console.log("   Or place files in: certs/service.p12 and certs/service.password");

	return {};
}

async function generateAndSaveCertificate(
	config: ServiceIdentityConfig,
	certPath: string,
	passwordPath: string,
): Promise<{ p12Certificate: Buffer; p12Password: string; certificateFingerprint: string }> {
	// Generate a random password
	const p12Password = crypto.randomBytes(32).toString("hex");

	// Import the generator
	const { generateSelfSignedP12 } = await import("./pdf-digital-signature.js");

	// Generate certificate
	const p12Certificate = await generateSelfSignedP12(config.organizationName, config.serviceEmail, p12Password);

	// Save locally
	const certsDir = path.dirname(certPath);
	if (!fs.existsSync(certsDir)) {
		fs.mkdirSync(certsDir, { recursive: true });
	}

	fs.writeFileSync(certPath, p12Certificate);
	fs.writeFileSync(passwordPath, p12Password);

	// Add to .gitignore if not already
	const gitignorePath = path.resolve(__dirname, "../../../.gitignore");
	if (fs.existsSync(gitignorePath)) {
		const gitignore = fs.readFileSync(gitignorePath, "utf-8");
		if (!gitignore.includes("certs/")) {
			fs.appendFileSync(gitignorePath, "\n# Auto-generated certificates\ncerts/\n");
		}
	}

	const certificateFingerprint = crypto.createHash("sha256").update(p12Certificate).digest("hex").slice(0, 32);

	console.log(`✅ Generated self-signed certificate: ${certPath}`);
	console.log(`   Fingerprint: ${certificateFingerprint}`);
	console.log(`   ⚠️ This is for DEVELOPMENT ONLY. Use proper CA cert for production.`);

	return { p12Certificate, p12Password, certificateFingerprint };
}

// ============================================================================
// WITNESS METADATA
// ============================================================================

/**
 * Build witness metadata for embedding in signatures
 * This is what proves the service witnessed the signing event
 */
export function buildWitnessMetadata(): {
	service: {
		name: string;
		url: string;
		organization: string;
		location: string;
		country: string;
		certificateFingerprint?: string;
	};
	deploy: DeployInstanceInfo;
} {
	const identity = getServiceIdentity();

	return {
		service: {
			name: identity.config.serviceName,
			url: identity.config.serviceUrl,
			organization: identity.config.organizationName,
			location: identity.deploy.region.displayName,
			country: identity.deploy.region.country,
			certificateFingerprint: identity.certificateFingerprint,
		},
		deploy: identity.deploy,
	};
}
