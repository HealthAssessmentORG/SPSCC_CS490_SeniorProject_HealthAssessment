import "dotenv/config";

import fs from "node:fs";

import { closeApplication2Pool } from "../02/src/db_connect.js";
import { renderApplication3Ui } from "./ui.js";

type ParsedArgs = { command: "help" } | { command: "ui" };

function usage(exitCode = 0): never {
	const msg = `
Usage:
  node --import tsx Application/03/main.ts --help
  node --import tsx Application/03/main.ts ui

Application 3 status:
  Ink UI compares out/output.txt against the Application 2 database.
`.trim();

	fs.writeSync(1, msg + "\n");
	process.exit(exitCode);
}

function parseUiArgs(rest: string[]): ParsedArgs {
	for (const arg of rest) {
		if (arg === "-h" || arg === "--help") {
			return { command: "help" };
		}
		throw new Error(`Unknown argument for ui: ${arg}`);
	}

	return { command: "ui" };
}

function parseArgs(argv: string[]): ParsedArgs {
	if (argv.length === 0) {
		return { command: "ui" };
	}

	const [command, ...rest] = argv;
	if (command === "-h" || command === "--help") {
		return { command: "help" };
	}

	if (command === "ui") {
		return parseUiArgs(rest);
	}

	if (rest.length > 0) {
		throw new Error(`Unknown argument for ${command}: ${rest[0]}`);
	}

	return { command: "ui" };
}

async function main() {
	let args: ParsedArgs;

	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		fs.writeSync(2, `${(error as Error).message}\n`);
		usage(1);
	}

	if (args.command === "help") usage(0);

	const app = renderApplication3Ui();

	try {
		await app.waitUntilExit();
	} finally {
		await closeApplication2Pool();
	}
}

main().catch((error) => {
	console.error("Failed to run Application 3 UI:", error);
	process.exitCode = 1;
});