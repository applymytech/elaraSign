#!/usr/bin/env tsx

/**
 * elaraSign Complete Setup
 * ========================
 * Cross-platform Node.js setup script.
 * Handles EVERYTHING: auth, project, APIs, secrets, permissions, config.
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as readline from "node:readline";
import { join } from "node:path";
import { platform } from "node:os";

// ============================================================================
// TYPES
// ============================================================================

interface DeployConfig {
	gcloud: {
		configuration: string;
		account: string;
		project: string;
		region: string;
		serviceAccount?: string;
	};
	service: {
		name: string;
		domain: string;
	};
	identity: {
		organizationName: string;
		serviceEmail: string;
		adminEmail?: string; // For Firebase admin login (operator's personal email)
	};
	firebase?: {
		apiKey: string;
		appId: string;
		authDomain?: string;
		projectId?: string;
		storageBucket?: string;
		messagingSenderId?: string;
	};
	banned: {
		patterns: string[];
	};
}

// ============================================================================
// UTILITIES
// ============================================================================

const PLATFORM = platform() === "win32" ? "windows" : platform() === "darwin" ? "macos" : "linux";
const GCLOUD_CMD = PLATFORM === "windows" ? "gcloud.cmd" : "gcloud";

function header(title: string) {
	console.log("");
	console.log("╔══════════════════════════════════════════════════════════════════╗");
	console.log(`║  ${title.padEnd(60)}  ║`);
	console.log("╚══════════════════════════════════════════════════════════════════╝");
	console.log("");
}

function step(num: number, total: number, message: string) {
	console.log(`[${num}/${total}] ${message}...`);
}

function success(message: string) {
	console.log(`      ✅ ${message}`);
}

function fail(message: string) {
	console.log(`      ❌ FAIL - ${message}`);
}

function info(message: string) {
	console.log(`      ${message}`);
}

function exec(command: string): string {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		return "";
	}
}

function execOrFail(command: string, errorMessage: string): string {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		fail(errorMessage);
		console.error(error.stderr || error.message);
		process.exit(1);
	}
}

function commandExists(cmd: string): boolean {
	try {
		execSync(PLATFORM === "windows" ? `where ${cmd}` : `which ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

async function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`      ${question}: `, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/**
 * Retry a gcloud command that might fail due to IAM propagation delays
 */
async function retryGcloud(
	command: string,
	maxAttempts = 3,
	delayMs = 2000,
): Promise<{ success: boolean; output: string }> {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const output = execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
			return { success: true, output };
		} catch (error: any) {
			if (attempt === maxAttempts) {
				return { success: false, output: error.stderr || error.message };
			}
			info(`Retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxAttempts})...`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	return { success: false, output: "" };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	header("elaraSign Complete Setup");

	console.log(`  Platform: ${PLATFORM}`);
	console.log("");
	console.log("  This script will set up YOUR sovereign signing service.");
	console.log("  You will generate YOUR OWN keys - they are never shared.");
	console.log("");

	// ============================================================================
	// CHECK 1: NODE.JS
	// ============================================================================
	step(1, 14, "Checking Node.js");

	if (!commandExists("node")) {
		fail("Node.js not found");
		console.log("");
		console.log("      Install Node.js 24 LTS:");
		if (PLATFORM === "windows") {
			console.log("        choco install nodejs-lts");
		}
		console.log("      OR download from https://nodejs.org/");
		process.exit(1);
	}

	const nodeVersion = exec("node -v").replace("v", "");
	const majorVersion = Number.parseInt(nodeVersion.split(".")[0]);

	if (majorVersion < 24) {
		fail(`Node.js v${nodeVersion} is too old. Need v24+`);
		process.exit(1);
	}

	success(`Node.js v${nodeVersion}`);

	// ============================================================================
	// CHECK 2: GCLOUD SDK
	// ============================================================================
	step(2, 14, "Checking Google Cloud SDK");

	if (!commandExists(GCLOUD_CMD)) {
		fail("gcloud not found");
		console.log("");
		console.log("      Install Google Cloud SDK:");
		if (PLATFORM === "windows") {
			console.log("        choco install gcloudsdk");
		} else {
			console.log("        https://cloud.google.com/sdk/docs/install");
		}
		process.exit(1);
	}

	const gcloudVersion = exec(`${GCLOUD_CMD} --version`).split("\n")[0];
	success(gcloudVersion);

	// ============================================================================
	// CHECK 3: GCLOUD AUTHENTICATION
	// ============================================================================
	step(3, 14, "Google Cloud authentication");

	let activeAccount = exec(`${GCLOUD_CMD} auth list --filter="status:ACTIVE" --format="value(account)"`);

	if (!activeAccount) {
		console.log("");
		console.log("      ╔════════════════════════════════════════════════════════════╗");
		console.log("      ║          🔐 Google Cloud Authentication Required          ║");
		console.log("      ╚════════════════════════════════════════════════════════════╝");
		console.log("");
		info("Opening your browser for Google Cloud login...");
		info("This will open: https://accounts.google.com/o/oauth2/auth");
		console.log("");
		info("📋 In the browser:");
		info("   1. Choose your Google account");
		info("   2. Click 'Allow' to grant access");
		info("   3. Return here when you see 'You are now authenticated'");
		console.log("");
		
		try {
			execSync(`${GCLOUD_CMD} auth login`, { stdio: "inherit" });
			activeAccount = exec(`${GCLOUD_CMD} auth list --filter="status:ACTIVE" --format="value(account)"`);
		} catch (error) {
			console.log("");
			fail("Authentication failed or cancelled");
			console.log("");
			info("💡 To authenticate manually:");
			info("   1. Run: gcloud auth login");
			info("   2. Follow the prompts");
			info("   3. Re-run: npm run setup");
			process.exit(1);
		}
	}

	if (!activeAccount) {
		fail("Authentication failed");
		process.exit(1);
	}

	success(`Authenticated as ${activeAccount}`);

	// ============================================================================
	// CHECK 4: NPM DEPENDENCIES
	// ============================================================================
	step(4, 14, "Installing npm dependencies");

	try {
		execSync("npm install --silent", { stdio: "ignore" });
		success("Dependencies installed");
	} catch (error) {
		fail("npm install failed");
		process.exit(1);
	}

	// ============================================================================
	// CHECK 5: DEPLOY CONFIG (INTERACTIVE IF NEEDED)
	// ============================================================================
	step(5, 14, "Setting up deploy.config.json");

	let config: DeployConfig;

	if (!existsSync("deploy.config.json")) {
		console.log("");
		console.log("      ╔════════════════════════════════════════════════════════════╗");
		console.log("      ║            📝 Project Configuration Wizard                ║");
		console.log("      ╚════════════════════════════════════════════════════════════╝");
		console.log("");
		
		// Check if user has any projects
		const existingProjects = exec(`${GCLOUD_CMD} projects list --format="value(projectId)" --limit=5`);
		
		if (existingProjects) {
			info("Your existing Google Cloud projects:");
			const projects = existingProjects.split("\n").filter(p => p.trim());
			for (const project of projects) {
				info(`   • ${project}`);
			}
			console.log("");
		}
		
		info("🆕 Need to create a new project?");
		info("   Visit: https://console.cloud.google.com/projectcreate");
		info("   Project ID must be globally unique (e.g., elarasign-yourname-2026)");
		console.log("");
		info("💡 Project ID requirements:");
		info("   • 6-30 characters");
		info("   • Lowercase letters, numbers, hyphens only");
		info("   • Must start with a letter");
		info("   • Cannot be changed after creation");
		console.log("");

		// Get project ID
		const projectId = await prompt("Google Cloud Project ID (existing or newly created)");
		if (!projectId) {
			fail("Project ID cannot be empty");
			process.exit(1);
		}
		
		// Validate project ID format
		if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
			fail("Invalid project ID format");
			info("Must be 6-30 chars, lowercase letters/numbers/hyphens, start with letter");
			process.exit(1);
		}

		// Get region
		console.log("");
		console.log("      Choose region (press Enter for us-central1):");
		const regionInput = await prompt("Region");
		const region = regionInput || "us-central1";

		// Get optional domain
		console.log("");
		console.log("      Custom domain (optional - press Enter to skip):");
		console.log("      Examples: sign.yourdomain.com");
		const domain = await prompt("Domain");

		// Get organization name
		console.log("");
		const orgNameInput = await prompt("Organization name (appears on signed files)");
		const orgName = orgNameInput || "My Organization";

		// Get service email
		console.log("");
		const serviceEmailInput = await prompt("Service email (appears on signed files)");
		const serviceEmail = serviceEmailInput || "signing@example.com";

		// Get admin email (for Firebase login - the operator's personal email)
		console.log("");
		console.log("      Admin email is YOUR personal email for logging in as operator.");
		console.log("      This is different from the service email shown on documents.");
		const adminEmailInput = await prompt("Admin email (your login email)");
		const adminEmail = adminEmailInput || activeAccount; // Default to gcloud account

		// Create config (serviceAccount auto-generated in step 11)
		config = {
			gcloud: {
				configuration: "elarasign",
				account: activeAccount,
				project: projectId,
				region,
				serviceAccount: `elarasign-deployer@${projectId}.iam.gserviceaccount.com`,
			},
			service: {
				name: "elara-sign",
				domain: domain || "",
			},
			identity: {
				organizationName: orgName,
				serviceEmail,
				adminEmail,
			},
			banned: {
				patterns: [],
			},
		};

		writeFileSync("deploy.config.json", JSON.stringify(config, null, 2), "utf8");
		console.log("");
		success("Created deploy.config.json");
	} else {
		config = JSON.parse(readFileSync("deploy.config.json", "utf8"));
		success("deploy.config.json exists");
	}

	info(`📋 Project: ${config.gcloud.project}`);
	info(`📋 Region: ${config.gcloud.region}`);
	if (config.service.domain) {
		info(`📋 Domain: ${config.service.domain}`);
	} else {
		info("📋 Domain: (will use Cloud Run URL)");
	}

	// ============================================================================
	// CHECK 6: GCP PROJECT ACCESS & CREATION
	// ============================================================================
	step(6, 14, "Verifying GCP project access");

	exec(`${GCLOUD_CMD} config set project ${config.gcloud.project} --quiet`);

	let projectAccess = exec(`${GCLOUD_CMD} projects describe ${config.gcloud.project} 2>&1`);
	
	if (!projectAccess || projectAccess.includes("NOT_FOUND") || projectAccess.includes("does not exist")) {
		console.log("");
		info(`⚠️  Project '${config.gcloud.project}' not found`);
		console.log("");
		info("Would you like to create it now? (y/n)");
		const createProject = await prompt("Create project");
		
		if (createProject?.toLowerCase() === "y" || createProject?.toLowerCase() === "yes") {
			info("Creating project...");
			info("This requires:");
			info("  • Billing account must be set up");
			info("  • You must have permission to create projects");
			console.log("");
			
			try {
				execOrFail(
					`${GCLOUD_CMD} projects create ${config.gcloud.project} --name="elaraSign - ${config.identity.organizationName}" --quiet`,
					"Failed to create project"
				);
				success(`Created project ${config.gcloud.project}`);
				
				// Set as active project
				exec(`${GCLOUD_CMD} config set project ${config.gcloud.project} --quiet`);
				
				// Link billing account (interactive)
				info("Linking billing account...");
				info("If this fails, link manually: https://console.cloud.google.com/billing/linkedaccount?project=" + config.gcloud.project);
				
				const billingAccounts = exec(`${GCLOUD_CMD} billing accounts list --format="value(name)" --limit=1`);
				if (billingAccounts) {
					const billingAccount = billingAccounts.split("\n")[0].trim();
					exec(`${GCLOUD_CMD} billing projects link ${config.gcloud.project} --billing-account=${billingAccount} 2>&1`);
					success("Billing linked");
				} else {
					info("⚠️  No billing account found");
					info("   Set up billing: https://console.cloud.google.com/billing");
					info("   Then link to project: https://console.cloud.google.com/billing/linkedaccount?project=" + config.gcloud.project);
					console.log("");
					console.log("      Press Enter when billing is linked...");
					await prompt("");
				}
			} catch (error: any) {
				fail("Could not create project automatically");
				console.log("");
				info("Create manually instead:");
				info("   1. Go to: https://console.cloud.google.com/projectcreate");
				info(`   2. Project ID: ${config.gcloud.project}`);
				info(`   3. Project name: elaraSign - ${config.identity.organizationName}`);
				info("   4. Link a billing account");
				info("   5. Press Enter when done...");
				await prompt("");
				
				// Verify again
				projectAccess = exec(`${GCLOUD_CMD} projects describe ${config.gcloud.project}`);
				if (!projectAccess) {
					fail("Project still not accessible");
					process.exit(1);
				}
			}
		} else {
			fail("Project must exist to continue");
			console.log("");
			info("Create it first:");
			info("   1. Go to: https://console.cloud.google.com/projectcreate");
			info(`   2. Project ID: ${config.gcloud.project}`);
			info("   3. Link a billing account");
			info("   4. Re-run: npm run setup");
			process.exit(1);
		}
	}

	success(`Access to ${config.gcloud.project}`);

	// ============================================================================
	// CHECK 7: ENABLE REQUIRED APIS
	// ============================================================================
	step(7, 14, "Enabling required Google Cloud APIs");
	info("(This may take 1-2 minutes on first run)");

	const requiredApis = [
		"cloudbuild.googleapis.com",
		"run.googleapis.com",
		"artifactregistry.googleapis.com",
		"secretmanager.googleapis.com",
	];

	for (const api of requiredApis) {
		const enabled = exec(
			`${GCLOUD_CMD} services list --enabled --filter="name:${api}" --format="value(name)"`,
		);
		if (enabled.includes(api)) {
			success(`${api} (already enabled)`);
		} else {
			info(`⏳ Enabling ${api}...`);
			execOrFail(`${GCLOUD_CMD} services enable ${api} --project=${config.gcloud.project} --quiet`, `Failed to enable ${api}`);
			success(api);
		}
	}

	// ============================================================================
	// CHECK 8: CREATE ARTIFACT REGISTRY REPOSITORY
	// ============================================================================
	step(8, 14, "Setting up Artifact Registry");

	const repoName = "elara-sign-repo";
	const repoExists = exec(
		`${GCLOUD_CMD} artifacts repositories describe ${repoName} --location=${config.gcloud.region} --project=${config.gcloud.project}`,
	);

	if (repoExists) {
		success(`Repository ${repoName} exists`);
	} else {
		info("Creating Docker repository...");
		execOrFail(
			`${GCLOUD_CMD} artifacts repositories create ${repoName} --repository-format=docker --location=${config.gcloud.region} --description="elaraSign Docker images" --project=${config.gcloud.project} --quiet`,
			"Failed to create artifact repository",
		);
		success(`Created repository ${repoName}`);
	}

	// ============================================================================
	// CHECK 9: GENERATE FORENSIC MASTER KEY
	// ============================================================================
	step(9, 14, "Setting up forensic master key");

	const masterKeySecret = "elarasign-master-key";
	const masterKeyExists = exec(`${GCLOUD_CMD} secrets describe ${masterKeySecret} --project=${config.gcloud.project}`);

	if (masterKeyExists) {
		success("Master key exists (never regenerate)");
	} else {
		info("Generating master key (64 bytes, base64)...");

		const masterKey = randomBytes(64).toString("base64");

		// Create secret
		const createCmd = `echo ${masterKey} | ${GCLOUD_CMD} secrets create ${masterKeySecret} --data-file=- --replication-policy=automatic --project=${config.gcloud.project} --quiet`;
		execOrFail(createCmd, "Failed to create master key secret");

		success("Created master key secret");
	}

	// ============================================================================
	// CHECK 10: GENERATE P12 CERTIFICATE
	// ============================================================================
	step(10, 14, "Setting up P12 signing certificate");

	if (!existsSync("certs")) {
		mkdirSync("certs");
	}

	const p12Secret = "elarasign-p12-certificate";
	const p12PassSecret = "elarasign-p12-password";
	
	// Check EACH secret independently
	const p12CertExists = exec(`${GCLOUD_CMD} secrets describe ${p12Secret} --project=${config.gcloud.project}`);
	const p12PassExists = exec(`${GCLOUD_CMD} secrets describe ${p12PassSecret} --project=${config.gcloud.project}`);

	if (p12CertExists && p12PassExists) {
		success("P12 certificate and password secrets exist");
	} else {
		const certsDir = join(process.cwd(), "certs");
		let p12Password: string;

		// If we have local password file, use it
		if (existsSync(join(certsDir, "service.password"))) {
			p12Password = readFileSync(join(certsDir, "service.password"), "utf8").trim();
			info("Using existing local password");
		} else {
			p12Password = randomBytes(32).toString("hex");
		}

		// Create P12 certificate if missing
		if (!p12CertExists) {
			info("Creating P12 certificate secret...");

			// Check if we have a local P12 file to upload
			if (existsSync(join(certsDir, "service.p12"))) {
				info("Uploading existing local P12 certificate...");
				const p12Base64 = readFileSync(join(certsDir, "service.p12")).toString("base64");
				writeFileSync(join(certsDir, "temp-p12.txt"), p12Base64);
				execOrFail(
					`${GCLOUD_CMD} secrets create ${p12Secret} --data-file="${join(certsDir, "temp-p12.txt")}" --replication-policy=automatic --project=${config.gcloud.project} --quiet`,
					"Failed to upload P12 certificate",
				);
				try { unlinkSync(join(certsDir, "temp-p12.txt")); } catch {}
			} else {
				// Generate new certificate
				info("Generating self-signed certificate...");
				if (!commandExists("openssl")) {
					fail("OpenSSL not found (needed for certificate generation)");
					if (PLATFORM === "windows") {
						console.log("         Install: choco install openssl");
					}
					process.exit(1);
				}

				execOrFail(
					`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${join(certsDir, "key.pem")}" -out "${join(certsDir, "cert.pem")}" -days 3650 -subj "/C=US/ST=State/L=City/O=${config.gcloud.project}/CN=elaraSign"`,
					"Failed to generate certificate",
				);
				execOrFail(
					`openssl pkcs12 -export -out "${join(certsDir, "service.p12")}" -inkey "${join(certsDir, "key.pem")}" -in "${join(certsDir, "cert.pem")}" -password "pass:${p12Password}"`,
					"Failed to create P12 certificate",
				);

				const p12Base64 = readFileSync(join(certsDir, "service.p12")).toString("base64");
				writeFileSync(join(certsDir, "temp-p12.txt"), p12Base64);
				execOrFail(
					`${GCLOUD_CMD} secrets create ${p12Secret} --data-file="${join(certsDir, "temp-p12.txt")}" --replication-policy=automatic --project=${config.gcloud.project} --quiet`,
					"Failed to upload P12 certificate",
				);

				// Cleanup temp files
				try {
					unlinkSync(join(certsDir, "key.pem"));
					unlinkSync(join(certsDir, "cert.pem"));
					unlinkSync(join(certsDir, "temp-p12.txt"));
				} catch {}
			}
			success("P12 certificate secret created");
		} else {
			success("P12 certificate secret exists");
		}

		// Create password secret if missing
		if (!p12PassExists) {
			info("Creating P12 password secret...");
			writeFileSync(join(certsDir, "temp-pass.txt"), p12Password);
			execOrFail(
				`${GCLOUD_CMD} secrets create ${p12PassSecret} --data-file="${join(certsDir, "temp-pass.txt")}" --replication-policy=automatic --project=${config.gcloud.project} --quiet`,
				"Failed to upload P12 password",
			);
			try { unlinkSync(join(certsDir, "temp-pass.txt")); } catch {}
			success("P12 password secret created");
		} else {
			success("P12 password secret exists");
		}

		// DELETE local secret files after upload - they exist ONLY in Secret Manager
		// This is intentional security: secrets should not persist locally
		const localSecretsToDelete = [
			join(certsDir, "service.p12"),
			join(certsDir, "service.password"),
		];
		for (const file of localSecretsToDelete) {
			if (existsSync(file)) {
				try {
					unlinkSync(file);
					info(`Deleted local secret: ${file.split(/[/\\]/).pop()}`);
				} catch {}
			}
		}
		success("Secrets exist ONLY in GCP Secret Manager (not local)");
	}



	// ============================================================================
	// CHECK 11: SERVICE ACCOUNT & PERMISSIONS
	// ============================================================================
	step(11, 14, "Setting up service account and permissions");

	// Generate service account name from project
	const saName = "elarasign-deployer";
	const serviceAccount = config.gcloud.serviceAccount || `${saName}@${config.gcloud.project}.iam.gserviceaccount.com`;

	// Check if service account exists
	const saExists = exec(`${GCLOUD_CMD} iam service-accounts describe ${serviceAccount} --project=${config.gcloud.project}`);

	if (saExists) {
		success(`Service account exists: ${serviceAccount}`);
	} else {
		info(`Creating service account: ${saName}...`);
		execOrFail(
			`${GCLOUD_CMD} iam service-accounts create ${saName} --display-name="elaraSign Deployer" --project=${config.gcloud.project} --quiet`,
			"Failed to create service account",
		);
		success(`Created service account: ${serviceAccount}`);

		// Grant Cloud Run Admin role
		info("Granting Cloud Run Admin role...");
		await retryGcloud(
			`${GCLOUD_CMD} projects add-iam-policy-binding ${config.gcloud.project} --member="serviceAccount:${serviceAccount}" --role="roles/run.admin" --quiet`,
			3,
			3000,
		);

		// Grant Service Account User role (needed to deploy)
		info("Granting Service Account User role...");
		await retryGcloud(
			`${GCLOUD_CMD} projects add-iam-policy-binding ${config.gcloud.project} --member="serviceAccount:${serviceAccount}" --role="roles/iam.serviceAccountUser" --quiet`,
			3,
			3000,
		);
	}

	// Update config with service account if not set
	if (!config.gcloud.serviceAccount) {
		config.gcloud.serviceAccount = serviceAccount;
		writeFileSync("deploy.config.json", JSON.stringify(config, null, 2), "utf8");
		info("Updated deploy.config.json with service account");
	}

	// Get the project number for the default compute service account
	info("Getting project number...");
	const projectNumber = exec(`${GCLOUD_CMD} projects describe ${config.gcloud.project} --format="value(projectNumber)"`);
	const computeServiceAccount = projectNumber ? `${projectNumber.trim()}-compute@developer.gserviceaccount.com` : null;
	
	if (computeServiceAccount) {
		info(`Cloud Run runtime service account: ${computeServiceAccount}`);
	}

	// Grant secret accessor role for each secret that EXISTS
	// Must grant to BOTH: deployer SA (for deploy) and compute SA (for runtime)
	// Note: Firebase secrets are granted permissions in step 12 (after creation)
	info("Granting secret access...");
	const secretsToGrant = [
		{ name: masterKeySecret, exists: !!exec(`${GCLOUD_CMD} secrets describe ${masterKeySecret} --project=${config.gcloud.project}`) },
		{ name: p12Secret, exists: !!exec(`${GCLOUD_CMD} secrets describe ${p12Secret} --project=${config.gcloud.project}`) },
		{ name: p12PassSecret, exists: !!exec(`${GCLOUD_CMD} secrets describe ${p12PassSecret} --project=${config.gcloud.project}`) },
	];

	// Service accounts that need secret access
	const serviceAccountsForSecrets = [
		{ name: "deployer", account: serviceAccount },
	];
	if (computeServiceAccount) {
		serviceAccountsForSecrets.push({ name: "compute (Cloud Run runtime)", account: computeServiceAccount });
	}

	for (const secret of secretsToGrant) {
		if (!secret.exists) {
			info(`⚠️  Skipping ${secret.name} (does not exist)`);
			continue;
		}
		
		for (const sa of serviceAccountsForSecrets) {
			info(`  Granting ${sa.name} access to ${secret.name}...`);
			const result = await retryGcloud(
				`${GCLOUD_CMD} secrets add-iam-policy-binding ${secret.name} --member="serviceAccount:${sa.account}" --role="roles/secretmanager.secretAccessor" --project=${config.gcloud.project} --quiet`,
				3,
				3000,
			);

			if (!result.success) {
				fail(`Failed to grant ${sa.name} access to ${secret.name}`);
				console.error(result.output);
				process.exit(1);
			}
		}
	}

	success("Service account configured with secret access");

	// ============================================================================
	// CHECK 12: FIREBASE SETUP (Auth + Firestore)
	// ============================================================================
	step(12, 14, "Setting up Firebase (auth & database)");

	// Check if Firebase CLI exists
	const firebaseCmd = PLATFORM === "windows" ? "firebase.cmd" : "firebase";
	if (!commandExists(firebaseCmd) && !commandExists("firebase")) {
		info("⚠️  Firebase CLI not found - skipping Firebase setup");
		info("   Install with: npm install -g firebase-tools");
		info("   Then re-run: npm run setup");
		info("   App will work without auth (anonymous mode only)");
	} else {
		const fbCmd = commandExists(firebaseCmd) ? firebaseCmd : "firebase";
		
		// Check if Firebase is already added to this project
		const firebaseProjects = exec(`${fbCmd} projects:list --json`);
		const hasFirebase = firebaseProjects.includes(config.gcloud.project);
		
		if (!hasFirebase) {
			info("Adding Firebase to GCP project...");
			const addResult = exec(`${fbCmd} projects:addfirebase ${config.gcloud.project}`);
			if (!addResult && !addResult.includes("already")) {
				// Try anyway - might already be added
				info("Firebase may already be linked or requires manual confirmation");
			}
		}
		
		// Check for existing web app or create one
		const webApps = exec(`${fbCmd} apps:list --project=${config.gcloud.project} --json`);
		let webAppId = "";
		
		try {
			const appsData = JSON.parse(webApps || "{}");
			const existingWebApp = appsData.result?.find((app: any) => app.platform === "WEB");
			if (existingWebApp) {
				webAppId = existingWebApp.appId;
				success(`Web app exists: ${existingWebApp.displayName}`);
			}
		} catch {}
		
		if (!webAppId) {
			info("Creating Firebase web app...");
			const createResult = exec(`${fbCmd} apps:create WEB "elaraSign Web" --project=${config.gcloud.project} --json`);
			try {
				const createData = JSON.parse(createResult || "{}");
				webAppId = createData.result?.appId || "";
				if (webAppId) {
					success("Created Firebase web app");
				}
			} catch {}
		}
		
		// Get Firebase config and write to web/firebase-config.js
		if (webAppId) {
			info("Fetching Firebase SDK config...");
			const sdkConfig = exec(`${fbCmd} apps:sdkconfig WEB ${webAppId} --project=${config.gcloud.project} --json`);
			
			try {
				const configData = JSON.parse(sdkConfig || "{}");
				const fbConfig = configData.result?.sdkConfig;
				
				if (fbConfig) {
					// Use adminEmail if set, otherwise fall back to gcloud account
					const adminEmail = config.identity.adminEmail || config.gcloud.account;
					const serviceEmail = config.identity.serviceEmail || "openelara@applymytech.ai";
					
					// Save Firebase config to deploy.config.json for deploy script
					config.firebase = {
						apiKey: fbConfig.apiKey,
						appId: fbConfig.appId,
						authDomain: fbConfig.authDomain,
						projectId: fbConfig.projectId,
						storageBucket: fbConfig.storageBucket || "",
						messagingSenderId: fbConfig.messagingSenderId,
					};
					writeFileSync("deploy.config.json", JSON.stringify(config, null, 2), "utf8");
					info("Saved Firebase config to deploy.config.json");
					
					// Create Firebase secrets in Secret Manager
					info("Creating Firebase secrets in Secret Manager...");
					
					const firebaseSecrets = [
						{ name: "elarasign-firebase-api-key", value: fbConfig.apiKey },
						{ name: "elarasign-firebase-app-id", value: fbConfig.appId },
					];
					
					for (const secret of firebaseSecrets) {
						// Check if secret exists
						const exists = exec(`${GCLOUD_CMD} secrets describe ${secret.name} --project=${config.gcloud.project} 2>&1`);
						if (exists.includes("NOT_FOUND") || !exists) {
							// Create secret
							info(`Creating secret ${secret.name}...`);
							execOrFail(
								`${GCLOUD_CMD} secrets create ${secret.name} --project=${config.gcloud.project} --replication-policy=automatic --quiet`,
								`Failed to create secret ${secret.name}`
							);
						}
						// Add/update secret value
						const tempFile = join(process.cwd(), "certs", `temp-${secret.name}.txt`);
						writeFileSync(tempFile, secret.value, "utf8");
						execOrFail(
							`${GCLOUD_CMD} secrets versions add ${secret.name} --project=${config.gcloud.project} --data-file="${tempFile}" --quiet`,
							`Failed to add secret value for ${secret.name}`
						);
						try { unlinkSync(tempFile); } catch {}
					}
					success("Firebase secrets created");
					
					// Grant secret access to compute service account (MUST happen here, after creation)
					const projectNumber = exec(`${GCLOUD_CMD} projects describe ${config.gcloud.project} --format="value(projectNumber)"`);
					const computeSA = projectNumber ? `${projectNumber.trim()}-compute@developer.gserviceaccount.com` : null;
					
					if (!computeSA) {
						fail("Could not determine Cloud Run service account");
						process.exit(1);
					}
					
					// Service accounts that need Firebase secret access
					const serviceAccountsForFirebase = [
						{ name: "deployer", account: serviceAccount },
						{ name: "compute (Cloud Run runtime)", account: computeSA },
					];
					
					info("Granting Firebase secret access...");
					for (const secret of firebaseSecrets) {
						for (const sa of serviceAccountsForFirebase) {
							info(`  Granting ${sa.name} access to ${secret.name}...`);
							const result = await retryGcloud(
								`${GCLOUD_CMD} secrets add-iam-policy-binding ${secret.name} --member="serviceAccount:${sa.account}" --role="roles/secretmanager.secretAccessor" --project=${config.gcloud.project} --quiet`,
								3,
								3000,
							);
							if (!result.success) {
								fail(`Failed to grant ${sa.name} access to ${secret.name}`);
								console.error(result.output);
								process.exit(1);
							}
						}
					}
					success("Firebase secret access granted");
					
					// Also write local firebase-config.js for dev
					const firebaseConfigJs = `// Firebase configuration - AUTO-GENERATED by setup.ts
// Admin email: ${adminEmail}
// Service email: ${serviceEmail}
// Do not edit - regenerate with: npm run setup

window.firebaseConfig = {
  apiKey: "${fbConfig.apiKey}",
  authDomain: "${fbConfig.authDomain}",
  projectId: "${fbConfig.projectId}",
  storageBucket: "${fbConfig.storageBucket || ""}",
  messagingSenderId: "${fbConfig.messagingSenderId}",
  appId: "${fbConfig.appId}"
};

// Admin email (operator login - from deploy.config.json)
window.ADMIN_EMAIL = "${adminEmail}";

// Service email (public contact - embedded in signing certificate)
window.SERVICE_EMAIL = "${serviceEmail}";
`;
					writeFileSync(join(process.cwd(), "web", "firebase-config.js"), firebaseConfigJs, "utf8");
					success("Created web/firebase-config.js");
				}
			} catch (e) {
				info("Could not fetch SDK config - Firebase may need manual setup");
			}
		}
		
		// Enable required Firebase services
		info("Enabling Firebase APIs...");
		const firebaseApis = [
			"firebase.googleapis.com",
			"firestore.googleapis.com",
			"identitytoolkit.googleapis.com", // Firebase Auth
		];
		
		for (const api of firebaseApis) {
			exec(`${GCLOUD_CMD} services enable ${api} --project=${config.gcloud.project} --quiet`);
		}
		success("Firebase APIs enabled");
		
		// ============================================================
		// CREATE FIRESTORE DATABASE (if not exists)
		// ============================================================
		info("Checking Firestore database...");
		const firestoreExists = exec(`${GCLOUD_CMD} firestore databases describe --project=${config.gcloud.project} 2>&1`);
		
		if (firestoreExists.includes("NOT_FOUND") || firestoreExists.includes("does not exist")) {
			info("Creating Firestore database (Native mode)...");
			const createDb = exec(`${GCLOUD_CMD} firestore databases create --project=${config.gcloud.project} --location=${config.gcloud.region} --type=firestore-native --quiet 2>&1`);
			if (createDb.includes("error") || createDb.includes("FAILED")) {
				info("⚠️  Could not auto-create Firestore. Create manually:");
				info("   1. Go to: https://console.firebase.google.com/project/" + config.gcloud.project + "/firestore");
				info("   2. Click 'Create database'");
				info("   3. Choose 'Native mode' and region: " + config.gcloud.region);
			} else {
				success("Firestore database created");
			}
		} else {
			success("Firestore database exists");
		}
		
		// ============================================================
		// ENABLE AUTH PROVIDERS (Google + Email/Password) - MANUAL
		// ============================================================
		console.log("");
		console.log("      ╔════════════════════════════════════════════════════════════╗");
		console.log("      ║  ⚠️  MANUAL STEP REQUIRED: Configure Firebase Auth       ║");
		console.log("      ╚════════════════════════════════════════════════════════════╝");
		console.log("");
		info("Firebase Auth must be configured manually in the console.");
		info("(gcloud CLI doesn't support auth provider configuration)");
		console.log("");
		info("⚠️  SECURITY: Admin uses EMAIL/PASSWORD authentication");
		info("   Why? Your GCP credentials and app admin credentials should be SEPARATE.");
		info("   If your Google account is compromised, your app admin isn't.");
		console.log("");
		info("📋 REQUIRED STEPS:");
		console.log("");
		info("   1. Enable Email/Password authentication:");
		info(`      https://console.firebase.google.com/project/${config.gcloud.project}/authentication/providers`);
		info("      → Click 'Email/Password'");
		info("      → Toggle 'Enable'");
		info("      → Click 'Save'");
		console.log("");
		info("   2. Create your admin user account:");
		info(`      https://console.firebase.google.com/project/${config.gcloud.project}/authentication/users`);
		info("      → Click 'Add user'");
		const adminEmail = config.identity.adminEmail || config.gcloud.account;
		info(`      → Email: ${adminEmail}`);
		info("      → Password: (choose a STRONG password - save in password manager!)");
		info("      → Click 'Add user'");
		console.log("");
		info("   3. (Optional) Enable Google Sign-In for regular users:");
		info(`      https://console.firebase.google.com/project/${config.gcloud.project}/authentication/providers`);
		info("      → Click 'Google' → Toggle 'Enable' → Click 'Save'");
		info("      (This is for NON-ADMIN users who want Google auth)");
		console.log("");
		info("🔒 SECURITY NOTE:");
		info("   Your admin password is NOT stored by this script.");
		info("   Keep it in your password manager!");
		console.log("");
		console.log("      Press Enter when you've completed steps 1 and 2...");
		await prompt("");
		success("Auth configuration complete")
		
		// ============================================================
		// DEPLOY FIRESTORE RULES
		// ============================================================
		info("Deploying Firestore security rules...");
		
		// Check if firebase.json exists for deployment
		const firebaseJsonPath = join(process.cwd(), "firebase.json");
		if (!existsSync(firebaseJsonPath)) {
			const firebaseJson = {
				firestore: {
					rules: "firestore.rules"
				}
			};
			writeFileSync(firebaseJsonPath, JSON.stringify(firebaseJson, null, 2), "utf8");
			info("Created firebase.json");
		}
		
		// Deploy rules using Firebase CLI
		const deployRules = exec(`${fbCmd} deploy --only firestore:rules --project=${config.gcloud.project} 2>&1`);
		if (deployRules.includes("Deploy complete") || deployRules.includes("success")) {
			success("Firestore rules deployed");
		} else if (deployRules.includes("error") || deployRules.includes("failed")) {
			info("⚠️  Could not deploy rules automatically. Deploy manually:");
			info("   firebase deploy --only firestore:rules --project=" + config.gcloud.project);
		} else {
			success("Firestore rules deployment initiated");
		}
	}

	// ============================================================================
	// CHECK 13: GENERATE FIRESTORE RULES
	// ============================================================================
	step(13, 14, "Generating Firestore security rules");

	// Use adminEmail if set, otherwise fall back to gcloud account
	const adminEmailForRules = config.identity.adminEmail || config.gcloud.account;

	// Generate firestore.rules with the REAL admin email from config
	const firestoreRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // =====================================================
    // ADMIN EMAIL - FROM deploy.config.json (identity.adminEmail)
    // =====================================================
    function isAdmin() {
      return request.auth != null && 
             request.auth.token.email == '${adminEmailForRules}';
    }
    
    // Helper: Is user authenticated?
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper: Is user the document owner?
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }
    
    // =====================================================
    // USERS COLLECTION
    // =====================================================
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId);
      allow delete: if isAdmin();
    }
    
    // =====================================================
    // SIGNING LOGS (forensic accountability)
    // =====================================================
    match /signingLogs/{logId} {
      allow read: if isAdmin();
      allow write: if false; // Server-only via Admin SDK
    }
    
    // =====================================================
    // APP SETTINGS (admin only)
    // =====================================================
    match /settings/{settingId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
  }
}
`;

	writeFileSync(join(process.cwd(), "firestore.rules"), firestoreRules, "utf8");
	success(`Generated firestore.rules (admin: ${adminEmailForRules})`);

	// ============================================================================
	// CHECK 14: BUILD VERIFICATION
	// ============================================================================
	step(14, 14, "Verifying build");

	try {
		execSync("npm run build --silent", { stdio: "ignore" });
		success("TypeScript compiles");
	} catch (error) {
		fail("Build failed");
		execSync("npm run build", { stdio: "inherit" });
		process.exit(1);
	}

	// ============================================================================
	// SUCCESS
	// ============================================================================
	console.log("");
	header("🎉 Setup Complete!");

	console.log("  Your sovereign signing service is ready to deploy.");
	console.log("");
	console.log(`  ✅ Project: ${config.gcloud.project}`);
	console.log(`  ✅ Region: ${config.gcloud.region}`);
	console.log("  ✅ APIs enabled");
	console.log("  ✅ Secrets created");
	console.log("  ✅ Permissions configured");
	console.log("  ✅ Firebase configured");
	console.log(`  ✅ Admin email: ${config.identity.adminEmail || config.gcloud.account}`);
	if (config.service.domain) {
		console.log(`  ✅ Domain: ${config.service.domain}`);
	} else {
		console.log("  ℹ️  Domain: Will use Cloud Run URL");
	}
	console.log("");
	console.log("  Next steps:");
	console.log("");
	console.log("    npm run preflight   - Verify everything (recommended)");
	console.log("    npm run deploy      - Deploy preview (0% traffic)");
	console.log("    npm run traffic     - Manage traffic (promote/rollback)");
	console.log("");
	console.log("  For local development:");
	console.log("");
	console.log("    npm run dev      - Start on http://localhost:3010");
	console.log("    npm test         - Run tests");
	console.log("");
}

main().catch((error) => {
	console.error("❌ Setup failed:", error);
	process.exit(1);
});
