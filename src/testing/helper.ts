#!/usr/bin/env npx tsx
/**
 * elaraSign Helper - Diagnostics and Troubleshooting
 * ===================================================
 *
 * Helps diagnose issues by reading test logs and providing solutions.
 * Optionally uses Exa AI for contextual help.
 *
 * Usage:
 *   npx tsx src/testing/helper.ts status
 *   npx tsx src/testing/helper.ts diagnose
 *   npx tsx src/testing/helper.ts explain --error="message"
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// CLI Interface
// ============================================================================

interface HelperConfig {
	command: "help" | "diagnose" | "explain" | "status";
	logPath?: string;
	errorMessage?: string;
	exaKey?: string;
	verbose: boolean;
}

function parseArgs(): HelperConfig {
	const args = process.argv.slice(2);
	const config: HelperConfig = {
		command: "help",
		verbose: false,
	};

	if (args.length > 0 && !args[0].startsWith("--")) {
		config.command = args[0] as HelperConfig["command"];
	}

	for (const arg of args) {
		if (arg === "--help" || arg === "-h") {
			config.command = "help";
		}
		if (arg === "--verbose" || arg === "-v") {
			config.verbose = true;
		}
		if (arg.startsWith("--log=")) {
			config.logPath = arg.split("=")[1];
		}
		if (arg.startsWith("--error=")) {
			config.errorMessage = arg.split("=").slice(1).join("=");
		}
		if (arg.startsWith("--exa-key=")) {
			config.exaKey = arg.split("=")[1];
		}
	}

	config.exaKey = config.exaKey || process.env.EXA_API_KEY;

	return config;
}

function printHelp(): void {
	console.log(`
================================================================================
                         elaraSign Helper
================================================================================

Diagnose issues and get help with test failures.

COMMANDS:
  help      Show this help message
  diagnose  Analyze the most recent test log and explain failures
  explain   Get help for a specific error message
  status    Show status of recent test runs

USAGE:
  npx tsx src/testing/helper.ts <command> [options]

OPTIONS:
  --exa-key=KEY     Exa API key for AI-powered help (optional)
  --log=PATH        Path to specific diagnostic log JSON
  --error="msg"     Error message to explain
  --verbose, -v     Show detailed output

EXAMPLES:
  npx tsx src/testing/helper.ts status
  npx tsx src/testing/helper.ts diagnose
  npx tsx src/testing/helper.ts explain --error="401 Unauthorized"

GET EXA KEY (optional, for AI help):
  https://dashboard.exa.ai/api-keys
`);
}

// ============================================================================
// Exa Query
// ============================================================================

async function queryExa(exaKey: string, query: string): Promise<string | null> {
	try {
		const response = await fetch("https://api.exa.ai/answer", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": exaKey,
			},
			body: JSON.stringify({
				query,
				text: true,
			}),
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		return data.answer || null;
	} catch {
		return null;
	}
}

// ============================================================================
// Common Error Solutions
// ============================================================================

interface ErrorSolution {
	pattern: RegExp;
	title: string;
	solution: string;
}

const COMMON_SOLUTIONS: ErrorSolution[] = [
	{
		pattern: /401|Unauthorized|invalid.*key|api.*key/i,
		title: "Invalid API Key",
		solution: `
The API key appears to be invalid or expired.

TO FIX:
  1. Check the key has no extra spaces or quotes
  2. Verify the key hasn't expired
  3. Get a new key:
     - Together.ai: https://api.together.xyz/settings/api-keys
     - OpenAI: https://platform.openai.com/api-keys

Then run:
  npx tsx src/testing/test-runner.ts --together-key=YOUR_NEW_KEY
`,
	},
	{
		pattern: /429|rate.*limit|too.*many.*requests/i,
		title: "Rate Limited",
		solution: `
You've hit the API rate limit.

TO FIX:
  1. Wait a few minutes before trying again
  2. Check your usage at your provider's dashboard
  3. Consider upgrading your plan if this happens often
`,
	},
	{
		pattern: /ECONNREFUSED|ENOTFOUND|network|timeout/i,
		title: "Network Error",
		solution: `
Cannot connect to the API server.

TO FIX:
  1. Check your internet connection
  2. Verify you're not behind a blocking firewall
  3. Try: curl https://api.together.xyz/health
  4. If using a VPN, try disabling it temporarily
`,
	},
	{
		pattern: /npm.*install|module.*not.*found|cannot.*find/i,
		title: "Missing Dependencies",
		solution: `
Some dependencies are missing.

TO FIX:
  1. Run: npm install
  2. If that fails: rm -rf node_modules && npm install
  3. Make sure you're in the elaraSign directory
  4. Check Node.js version: node --version (need 20+)
`,
	},
	{
		pattern: /TypeScript|tsx|cannot.*compile|syntax/i,
		title: "Build Error",
		solution: `
There's a TypeScript or syntax issue.

TO FIX:
  1. Run: npm run build
  2. Check for syntax errors in the indicated file
  3. Run: npx tsc --noEmit to see all errors
`,
	},
	{
		pattern: /EACCES|permission|denied/i,
		title: "Permission Error",
		solution: `
Permission denied when accessing files.

TO FIX:
  1. On Windows: Run terminal as Administrator
  2. Check the output directory is writable
  3. Make sure no other process has the file open
`,
	},
];

function findCommonSolution(error: string): ErrorSolution | null {
	for (const solution of COMMON_SOLUTIONS) {
		if (solution.pattern.test(error)) {
			return solution;
		}
	}
	return null;
}

// ============================================================================
// Commands
// ============================================================================

async function explainError(config: HelperConfig): Promise<void> {
	if (!config.errorMessage) {
		console.log('\nPlease provide an error message with --error="..."');
		console.log('Example: npx tsx src/testing/helper.ts explain --error="401 Unauthorized"');
		return;
	}

	console.log("\n--- Analyzing Error ---\n");
	console.log(`Error: ${config.errorMessage}\n`);

	const commonSolution = findCommonSolution(config.errorMessage);
	if (commonSolution) {
		console.log(`[${commonSolution.title}]`);
		console.log(commonSolution.solution);
	} else {
		console.log("No common solution found for this error.");
	}

	if (config.exaKey) {
		console.log("\n--- Asking Exa AI ---\n");

		const query = `How to fix this error in a Node.js TypeScript project? Error: "${config.errorMessage}". Context: elaraSign content signing service, using Together.ai or OpenAI TTS APIs.`;

		const result = await queryExa(config.exaKey, query);

		if (result) {
			console.log("Exa suggests:\n");
			console.log(result);
		} else {
			console.log("Exa did not return a response.");
		}
	} else {
		console.log("\nTip: Add --exa-key=YOUR_KEY for AI-powered suggestions");
		console.log("Get a key at: https://dashboard.exa.ai/api-keys");
	}
}

interface DiagnosticLog {
	timestamp: string;
	testRun: string;
	tests: Array<{
		name: string;
		status: string;
		duration: number;
		details?: string;
		error?: string;
	}>;
	errors: Array<{
		timestamp: string;
		test: string;
		error: string;
		stack?: string;
		context?: Record<string, unknown>;
	}>;
	summary: {
		total: number;
		passed: number;
		failed: number;
	};
}

async function diagnoseLog(config: HelperConfig): Promise<void> {
	if (!config.logPath) {
		const testOutputDir = path.join(process.cwd(), "test-output");
		if (!fs.existsSync(testOutputDir)) {
			console.log("\nNo test-output directory found.");
			console.log("\nTo run tests:");
			console.log("  npx tsx src/testing/test-runner.ts --together-key=YOUR_KEY");
			console.log("\nGet a key at: https://api.together.xyz/settings/api-keys");
			return;
		}

		const runs = fs
			.readdirSync(testOutputDir)
			.filter((d) => d.startsWith("run-"))
			.sort()
			.reverse();

		if (runs.length === 0) {
			console.log("\nNo test runs found.");
			console.log("\nTo run tests:");
			console.log("  npx tsx src/testing/test-runner.ts --together-key=YOUR_KEY");
			return;
		}

		config.logPath = path.join(testOutputDir, runs[0], "diagnostic-log.json");
		console.log(`\nUsing most recent log: ${config.logPath}\n`);
	}

	if (!fs.existsSync(config.logPath)) {
		console.log(`\nLog file not found: ${config.logPath}`);
		return;
	}

	const log: DiagnosticLog = JSON.parse(fs.readFileSync(config.logPath, "utf-8"));

	console.log("================================================================================");
	console.log("                         Test Run Diagnosis");
	console.log("================================================================================\n");

	console.log(`Run: ${log.timestamp}`);
	console.log(`Results: ${log.summary.passed} passed, ${log.summary.failed} failed\n`);

	console.log("Tests:");
	for (const test of log.tests) {
		const status = test.status === "passed" ? "[PASS]" : "[FAIL]";
		console.log(`  ${status} ${test.name} (${test.duration}ms)`);
	}

	if (log.errors.length > 0) {
		console.log("\n--- Failures ---\n");

		for (const error of log.errors) {
			console.log(`Test: ${error.test}`);
			console.log(`Error: ${error.error}\n`);

			const solution = findCommonSolution(error.error);
			if (solution) {
				console.log(`[${solution.title}]`);
				console.log(solution.solution);
			}

			if (config.exaKey) {
				console.log("Asking Exa...\n");
				const result = await queryExa(
					config.exaKey,
					`Fix this error in elaraSign test: "${error.error}". Test: ${error.test}`,
				);
				if (result) {
					console.log(`Exa: ${result.slice(0, 400)}`);
				}
			}

			console.log(`\n${"-".repeat(60)}\n`);
		}
	} else if (log.summary.passed > 0) {
		console.log("\nAll tests passed. No issues to diagnose.\n");
	}
}

function showStatus(): void {
	const testOutputDir = path.join(process.cwd(), "test-output");

	console.log("\n================================================================================");
	console.log("                         Test Run Status");
	console.log("================================================================================\n");

	if (!fs.existsSync(testOutputDir)) {
		console.log("No test runs yet.\n");
		console.log("To run tests:");
		console.log("  npx tsx src/testing/test-runner.ts --together-key=YOUR_KEY\n");
		console.log("Get a key at: https://api.together.xyz/settings/api-keys");
		return;
	}

	const runs = fs
		.readdirSync(testOutputDir)
		.filter((d) => d.startsWith("run-"))
		.sort()
		.reverse()
		.slice(0, 10);

	if (runs.length === 0) {
		console.log("No test runs found.\n");
		return;
	}

	console.log("Recent test runs:\n");

	for (const run of runs) {
		const logPath = path.join(testOutputDir, run, "diagnostic-log.json");
		if (fs.existsSync(logPath)) {
			try {
				const log: DiagnosticLog = JSON.parse(fs.readFileSync(logPath, "utf-8"));
				const status = log.summary.failed === 0 ? "[PASS]" : "[FAIL]";
				const time = new Date(log.timestamp).toLocaleString();
				console.log(`  ${status} ${run}`);
				console.log(`       ${time}`);
				console.log(`       ${log.summary.passed} passed, ${log.summary.failed} failed`);
				console.log("");
			} catch {
				console.log(`  [????] ${run} (invalid log)`);
			}
		} else {
			console.log(`  [----] ${run} (no log)`);
		}
	}

	console.log("\nTo diagnose a run: npx tsx src/testing/helper.ts diagnose\n");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const config = parseArgs();

	switch (config.command) {
		case "help":
			printHelp();
			break;
		case "explain":
			await explainError(config);
			break;
		case "diagnose":
			await diagnoseLog(config);
			break;
		case "status":
			showStatus();
			break;
		default:
			console.log(`Unknown command: ${config.command}`);
			printHelp();
	}
}

main().catch(console.error);
