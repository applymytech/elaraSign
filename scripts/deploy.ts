#!/usr/bin/env tsx

/**
 * elaraSign Deploy (Preview)
 * ==========================
 * Deploys to Cloud Run with 0% traffic.
 * User tests the preview URL, then runs traffic tool to promote.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
		domain: string;
	};
	identity?: {
		adminEmail?: string;
		serviceEmail?: string;
	};
	firebase?: {
		apiKey?: string;
		appId?: string;
		messagingSenderId?: string;
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

function execOrFail(command: string, errorMessage: string): string {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		fail(errorMessage);
		console.error(error.stderr || error.message);
		process.exit(1);
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	// ============================================================================
	// LOAD CONFIG
	// ============================================================================
	if (!existsSync("deploy.config.json")) {
		console.error("❌ ERROR: deploy.config.json not found. Run: npm run setup");
		process.exit(1);
	}

	const config: DeployConfig = JSON.parse(readFileSync("deploy.config.json", "utf8"));

	header("elaraSign Deploy (Preview)");

	console.log(`  Project:  ${config.gcloud.project}`);
	console.log(`  Region:   ${config.gcloud.region}`);
	console.log(`  Platform: ${PLATFORM}`);
	console.log("");
	console.log("  This deploys with 0% traffic. Test preview, then promote.");
	console.log("");

	// ============================================================================
	// STEP 1: LINT
	// ============================================================================
	step(1, 5, "Lint check");

	try {
		const lintResult = execSync("npm run lint --silent", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
		if (lintResult.includes("No fixes") || lintResult.includes("All checks passed!")) {
			success("Lint passed");
		} else {
			fail("Lint issues found");
			execSync("npm run lint", { stdio: "inherit" });
			process.exit(1);
		}
	} catch (error) {
		fail("Lint issues found");
		execSync("npm run lint", { stdio: "inherit" });
		process.exit(1);
	}

	// ============================================================================
	// STEP 2: BUILD
	// ============================================================================
	step(2, 5, "Build");

	try {
		execSync("npm run build --silent", { stdio: "ignore" });
		success("Build passed");
	} catch (error) {
		fail("Build failed");
		execSync("npm run build", { stdio: "inherit" });
		process.exit(1);
	}

	// ============================================================================
	// STEP 3: GCLOUD AUTH
	// ============================================================================
	step(3, 5, "Checking gcloud");

	exec(`${GCLOUD_CMD} config set project ${config.gcloud.project} --quiet`);
	exec(`${GCLOUD_CMD} config set account ${config.gcloud.account} --quiet`);

	const activeAccount = exec(`${GCLOUD_CMD} auth list --filter="status:ACTIVE" --format="value(account)"`);
	if (!activeAccount) {
		fail("Not authenticated");
		console.log("      Run: gcloud auth login");
		process.exit(1);
	}

	success("Authenticated");

	// ============================================================================
	// STEP 4: SAVE CURRENT REVISION (for rollback)
	// ============================================================================
	step(4, 5, "Recording current revision");

	const currentRevision = exec(
		`${GCLOUD_CMD} run services describe ${config.service.name} --region=${config.gcloud.region} --format="value(status.traffic[0].revisionName)"`,
	);

	if (currentRevision) {
		writeFileSync(".last-live-revision", currentRevision, "utf8");
		success(`Current: ${currentRevision}`);
	} else {
		success("First deployment");
	}

	// ============================================================================
	// STEP 5: DEPLOY
	// ============================================================================
	step(5, 5, "Deploying preview");
	console.log("");

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
	
	// Build substitutions for Cloud Build
	const subs = [
		`SHORT_SHA="manual-${timestamp}"`,
		`_ADMIN_EMAIL="${config.identity?.adminEmail || ""}"`,
		`_SERVICE_EMAIL="${config.identity?.serviceEmail || ""}"`,
		`_FIREBASE_SENDER_ID="${config.firebase?.messagingSenderId || ""}"`,
	];

	try {
		execSync(`${GCLOUD_CMD} builds submit --config=cloudbuild.yaml --substitutions=${subs.join(",")}`, {
			stdio: "inherit",
		});
	} catch (error) {
		console.log("");
		console.log("❌ DEPLOY FAILED");
		process.exit(1);
	}

	// Get new revision
	await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for revision to be available

	const newRevision = exec(
		`${GCLOUD_CMD} run revisions list --service=${config.service.name} --region=${config.gcloud.region} --format="value(name)" --limit=1`,
	);

	if (newRevision) {
		writeFileSync(".preview-revision", newRevision, "utf8");
	}

	// Keep traffic on old revision
	if (currentRevision) {
		exec(
			`${GCLOUD_CMD} run services update-traffic ${config.service.name} --region=${config.gcloud.region} --to-revisions=${currentRevision}=100 --quiet`,
		);
	}

	// Get preview URL (tagged endpoint)
	const serviceUrl = exec(
		`${GCLOUD_CMD} run services describe ${config.service.name} --region=${config.gcloud.region} --format="value(status.url)"`,
	);
	// The tagged preview URL follows pattern: preview---<service-url>
	const previewUrl = serviceUrl ? serviceUrl.replace("https://", "https://preview---") : "(could not retrieve)";

	// ============================================================================
	// SUCCESS
	// ============================================================================
	console.log("");
	header("Preview Deployed!");

	console.log(`  🔗 PREVIEW URL: ${previewUrl}`);
	console.log("");
	if (config.service.domain) {
		console.log(`  🌐 Live URL:    https://${config.service.domain} (unchanged)`);
	} else {
		console.log("  🌐 Live URL:    (unchanged)");
	}
	console.log("");
	console.log(`  ✨ New revision: ${newRevision}`);
	if (currentRevision) {
		console.log(`  📦 Old revision: ${currentRevision}`);
	}
	console.log("");
	console.log("  NEXT:");
	console.log("    1. Click the preview URL above and test");
	console.log("    2. If good: npm run traffic promote");
	console.log("    3. If bad:  Do nothing (live unchanged)");
	console.log("");
}

main().catch((error) => {
	console.error("❌ Deploy failed:", error);
	process.exit(1);
});
