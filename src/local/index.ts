#!/usr/bin/env node
/**
 * elaraSign CLI
 *
 * Local command-line tool for signing and verifying files.
 */

import { signCommand } from "./commands/sign.js";
import { verifyCommand } from "./commands/verify.js";

const VERSION = "2.0.0";

const HELP = `
elaraSign CLI v${VERSION}
Universal file signing tool

USAGE:
  elara-sign <command> [options]

COMMANDS:
  sign <file>     Sign a file with provenance metadata
  verify <file>   Verify a signed file

OPTIONS:
  --help, -h      Show this help message
  --version, -v   Show version

EXAMPLES:
  elara-sign sign ./image.png
  elara-sign sign ./image.png --output ./signed.png
  elara-sign verify ./signed.png
`;

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		console.log(HELP);
		process.exit(0);
	}

	if (args.includes("--version") || args.includes("-v")) {
		console.log(`elara-sign v${VERSION}`);
		process.exit(0);
	}

	const command = args[0];
	const commandArgs = args.slice(1);

	switch (command) {
		case "sign":
			await signCommand(commandArgs);
			break;
		case "verify":
			await verifyCommand(commandArgs);
			break;
		default:
			console.error(`Unknown command: ${command}`);
			console.log(HELP);
			process.exit(1);
	}
}

main().catch((error) => {
	console.error("Error:", error.message);
	process.exit(1);
});
