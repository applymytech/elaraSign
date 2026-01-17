#!/usr/bin/env tsx

/**
 * elaraSign Traffic Management
 * =============================
 * Unified tool for promote/rollback/split traffic.
 * 
 * Usage:
 *   npm run traffic promote        - Send 100% traffic to latest revision
 *   npm run traffic rollback       - Rollback to previous revision
 *   npm run traffic split 50       - Split 50/50 between latest and previous
 *   npm run traffic list           - List all revisions
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { platform } from "node:os";
import * as readline from "node:readline";

// ============================================================================
// TYPES
// ============================================================================

interface DeployConfig {
	gcloud: {
		project: string;
		region: string;
	};
	service: {
		name: string;
		domain: string;
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

function exec(command: string): string {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		return "";
	}
}

async function confirm(question: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`  ${question} (y/N): `, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase() === "y");
		});
	});
}

// ============================================================================
// COMMANDS
// ============================================================================

async function promote(config: DeployConfig) {
	header("elaraSign Promote to Live");

	console.log(`  Project: ${config.gcloud.project}`);
	console.log(`  Service: ${config.service.name}`);
	console.log(`  Region:  ${config.gcloud.region}`);
	console.log("");

	// Show what we're promoting
	if (existsSync(".preview-revision")) {
		const preview = readFileSync(".preview-revision", "utf8").trim();
		console.log(`  Preview: ${preview}`);
	}
	if (existsSync(".last-live-revision")) {
		const current = readFileSync(".last-live-revision", "utf8").trim();
		console.log(`  Current: ${current}`);
	}
	console.log("");

	// Check auth
	const activeAccount = exec(`${GCLOUD_CMD} auth list --filter="status:ACTIVE" --format="value(account)"`);
	if (!activeAccount) {
		console.error("❌ ERROR: Not authenticated. Run: gcloud auth login");
		process.exit(1);
	}

	// Confirm
	const shouldPromote = await confirm("Promote latest revision to 100% traffic?");
	if (!shouldPromote) {
		console.log("  Cancelled.");
		process.exit(0);
	}

	// Promote
	console.log("");
	console.log("  Promoting to live...");

	try {
		execSync(
			`${GCLOUD_CMD} run services update-traffic ${config.service.name} --project=${config.gcloud.project} --region=${config.gcloud.region} --to-latest`,
			{ stdio: "inherit" },
		);
	} catch (error) {
		console.error("❌ Promotion failed");
		process.exit(1);
	}

	console.log("");
	header("LIVE!");

	if (config.service.domain) {
		console.log(`  https://${config.service.domain} is now serving the new version`);
	} else {
		console.log("  Your Cloud Run URL is now serving the new version");
	}
	console.log("");
	console.log("  If something is wrong: npm run traffic rollback");
	console.log("");
}

async function rollback(config: DeployConfig) {
	header("elaraSign Rollback");

	// Check for saved revision
	if (existsSync(".last-live-revision")) {
		const lastRevision = readFileSync(".last-live-revision", "utf8").trim();
		console.log(`  Previous good revision: ${lastRevision}`);
		console.log("");

		const shouldRollback = await confirm(`Rollback to ${lastRevision}?`);
		if (shouldRollback) {
			console.log("");
			console.log("  Rolling back...");

			try {
				execSync(
					`${GCLOUD_CMD} run services update-traffic ${config.service.name} --project=${config.gcloud.project} --region=${config.gcloud.region} --to-revisions=${lastRevision}=100`,
					{ stdio: "inherit" },
				);
			} catch (error) {
				console.error("❌ Rollback failed");
				process.exit(1);
			}

			console.log("");
			console.log(`  ✅ Rolled back to ${lastRevision}`);
			if (config.service.domain) {
				console.log(`  Live: https://${config.service.domain}`);
			}
			console.log("");
			return;
		}
	}

	// Manual rollback - list revisions
	console.log("");
	console.log("  Available revisions:");
	console.log("");

	execSync(
		`${GCLOUD_CMD} run revisions list --service=${config.service.name} --project=${config.gcloud.project} --region=${config.gcloud.region} --format="table(name,active,createTime)" --limit=10`,
		{ stdio: "inherit" },
	);

	console.log("");
	console.log("  To rollback manually:");
	console.log("");
	console.log(`    ${GCLOUD_CMD} run services update-traffic ${config.service.name} \\`);
	console.log(`      --project=${config.gcloud.project} \\`);
	console.log(`      --region=${config.gcloud.region} \\`);
	console.log("      --to-revisions=REVISION_NAME=100");
	console.log("");
}

async function split(config: DeployConfig, percentage: number) {
	header("elaraSign Traffic Split");

	if (percentage < 0 || percentage > 100) {
		console.error("❌ ERROR: Percentage must be between 0 and 100");
		process.exit(1);
	}

	// Get latest two revisions
	const revisions = exec(
		`${GCLOUD_CMD} run revisions list --service=${config.service.name} --region=${config.gcloud.region} --format="value(name)" --limit=2`,
	).split("\n");

	if (revisions.length < 2) {
		console.error("❌ ERROR: Need at least 2 revisions to split traffic");
		process.exit(1);
	}

	const [latest, previous] = revisions;
	const latestPercent = percentage;
	const previousPercent = 100 - percentage;

	console.log(`  Latest:   ${latest} → ${latestPercent}%`);
	console.log(`  Previous: ${previous} → ${previousPercent}%`);
	console.log("");

	const shouldSplit = await confirm(`Split traffic ${latestPercent}/${previousPercent}?`);
	if (!shouldSplit) {
		console.log("  Cancelled.");
		process.exit(0);
	}

	console.log("");
	console.log("  Splitting traffic...");

	try {
		execSync(
			`${GCLOUD_CMD} run services update-traffic ${config.service.name} --project=${config.gcloud.project} --region=${config.gcloud.region} --to-revisions=${latest}=${latestPercent},${previous}=${previousPercent}`,
			{ stdio: "inherit" },
		);
	} catch (error) {
		console.error("❌ Traffic split failed");
		process.exit(1);
	}

	console.log("");
	console.log(`  ✅ Traffic split: ${latestPercent}% new, ${previousPercent}% old`);
	console.log("");
}

async function list(config: DeployConfig) {
	header("elaraSign Revisions");

	console.log(`  Service: ${config.service.name}`);
	console.log(`  Region:  ${config.gcloud.region}`);
	console.log("");

	execSync(
		`${GCLOUD_CMD} run revisions list --service=${config.service.name} --project=${config.gcloud.project} --region=${config.gcloud.region} --format="table(name,active,traffic,createTime)" --limit=10`,
		{ stdio: "inherit" },
	);

	console.log("");
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	const command = process.argv[2];
	const arg = process.argv[3];

	// Load config
	if (!existsSync("deploy.config.json")) {
		console.error("❌ ERROR: deploy.config.json not found. Run: npm run setup");
		process.exit(1);
	}

	const config: DeployConfig = JSON.parse(readFileSync("deploy.config.json", "utf8"));

	// Check auth
	const activeAccount = exec(`${GCLOUD_CMD} auth list --filter="status:ACTIVE" --format="value(account)"`);
	if (!activeAccount) {
		console.error("❌ ERROR: Not authenticated. Run: gcloud auth login");
		process.exit(1);
	}

	// Route command
	switch (command) {
		case "promote":
			await promote(config);
			break;

		case "rollback":
			await rollback(config);
			break;

		case "split":
			if (!arg) {
				console.error("❌ ERROR: Usage: npm run traffic split <percentage>");
				console.error("   Example: npm run traffic split 50");
				process.exit(1);
			}
			await split(config, Number.parseInt(arg));
			break;

		case "list":
			await list(config);
			break;

		default:
			console.log("");
			console.log("elaraSign Traffic Management");
			console.log("=============================");
			console.log("");
			console.log("Usage:");
			console.log("  npm run traffic promote        - Send 100% traffic to latest revision");
			console.log("  npm run traffic rollback       - Rollback to previous revision");
			console.log("  npm run traffic split 50       - Split 50/50 between latest and previous");
			console.log("  npm run traffic list           - List all revisions");
			console.log("");
			process.exit(1);
	}
}

main().catch((error) => {
	console.error("❌ Traffic management failed:", error);
	process.exit(1);
});
