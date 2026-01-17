#!/usr/bin/env tsx

/**
 * elaraSign Preflight Check
 * =========================
 * Verifies EVERYTHING is ready before deployment.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { platform } from "node:os";

// ============================================================================
// TYPES
// ============================================================================

interface DeployConfig {
	gcloud: {
		project: string;
		region: string;
		account: string;
	};
	service: {
		name: string;
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

function exec(command: string): string {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		return "";
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

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	header("elaraSign Preflight Check");

	let allGood = true;

	// ============================================================================
	// CHECK 1: deploy.config.json
	// ============================================================================
	step(1, 8, "Checking configuration");

	if (!existsSync("deploy.config.json")) {
		fail("deploy.config.json not found");
		console.log("      Run: npm run setup");
		process.exit(1);
	}

	const config: DeployConfig = JSON.parse(readFileSync("deploy.config.json", "utf8"));
	success(`Project: ${config.gcloud.project}`);

	// ============================================================================
	// CHECK 2: gcloud CLI
	// ============================================================================
	step(2, 8, "Checking gcloud CLI");

	if (!commandExists(GCLOUD_CMD)) {
		fail("gcloud not found");
		allGood = false;
	} else {
		const version = exec(`${GCLOUD_CMD} --version`);
		if (version) {
			success("gcloud works");
		} else {
			fail("gcloud found but not working");
			allGood = false;
		}
	}

	// ============================================================================
	// CHECK 3: gcloud authentication
	// ============================================================================
	step(3, 8, "Checking gcloud authentication");

	const activeAccount = exec(`${GCLOUD_CMD} auth list --filter="status:ACTIVE" --format="value(account)"`);
	if (activeAccount) {
		success(`Authenticated as ${activeAccount}`);
	} else {
		fail("Not authenticated");
		console.log("      Run: gcloud auth login");
		allGood = false;
	}

	// ============================================================================
	// CHECK 4: Project access
	// ============================================================================
	step(4, 8, "Checking project access");

	const projectAccess = exec(`${GCLOUD_CMD} projects describe ${config.gcloud.project}`);
	if (projectAccess) {
		success(`Access to ${config.gcloud.project}`);
	} else {
		fail(`No access to ${config.gcloud.project}`);
		allGood = false;
	}

	// ============================================================================
	// CHECK 5: Code integrity (lint)
	// ============================================================================
	step(5, 8, "Checking code (lint)");

	try {
		const lintResult = execSync("npm run lint --silent", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
		if (lintResult.includes("No fixes") || lintResult.includes("All checks passed!")) {
			success("Lint passed");
		} else {
			fail("Lint issues found");
			allGood = false;
		}
	} catch (error) {
		fail("Lint issues found");
		allGood = false;
	}

	// ============================================================================
	// CHECK 6: Code integrity (build)
	// ============================================================================
	step(6, 8, "Checking code (build)");

	try {
		execSync("npm run build --silent", { stdio: "ignore" });
		success("TypeScript compiles");
	} catch (error) {
		fail("Build failed");
		allGood = false;
	}

	// ============================================================================
	// CHECK 7: Secrets exist
	// ============================================================================
	step(7, 8, "Checking secrets");

	const requiredSecrets = ["elarasign-master-key", "elarasign-p12-certificate", "elarasign-p12-password"];

	let allSecretsExist = true;
	for (const secret of requiredSecrets) {
		const exists = exec(`${GCLOUD_CMD} secrets describe ${secret} --project=${config.gcloud.project}`);
		if (!exists) {
			fail(`Secret '${secret}' not found`);
			allSecretsExist = false;
			allGood = false;
		}
	}

	if (allSecretsExist) {
		success("All secrets exist");
	}

	// ============================================================================
	// CHECK 8: Service account permissions
	// ============================================================================
	step(8, 8, "Checking service account permissions");

	const projectNumber = exec(`${GCLOUD_CMD} projects describe ${config.gcloud.project} --format="value(projectNumber)"`);
	if (projectNumber) {
		const computeSA = `${projectNumber}-compute@developer.gserviceaccount.com`;

		// Check if service account can access at least one secret
		const secretAccess = exec(
			`${GCLOUD_CMD} secrets get-iam-policy elarasign-master-key --project=${config.gcloud.project} --format="value(bindings.members)" --flatten="bindings[].members" --filter="bindings.role:roles/secretmanager.secretAccessor"`,
		);

		if (secretAccess.includes(computeSA)) {
			success("Service account has secret access");
		} else {
			fail("Service account lacks secret access");
			console.log(`      Run: npm run setup (to fix permissions)`);
			allGood = false;
		}
	} else {
		fail("Could not get project number");
		allGood = false;
	}

	// ============================================================================
	// RESULT
	// ============================================================================
	console.log("");
	if (allGood) {
		header("✅ All Checks Passed!");
		console.log("  You're ready to deploy:");
		console.log("");
		console.log("    npm run deploy");
		console.log("");
	} else {
		header("❌ Preflight Failed");
		console.log("  Fix the issues above and run again:");
		console.log("");
		console.log("    npm run preflight");
		console.log("");
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("❌ Preflight check failed:", error);
	process.exit(1);
});
