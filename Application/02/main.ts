import fs from "node:fs";

import { closeApplication2Pool } from "./src/db_connect.js";

type ParsedArgs = { command: "help" } | { command: "ui" };

function usage(exitCode = 0): never {
  const msg = `
Usage:
  node --import tsx Application/02/main.ts --help
  node --import tsx Application/02/main.ts ui

Note: export and db-summary features are not available in this workspace copy.

Application 2 status:
  Ink UI is available.
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
    throw new Error("A command is required: ui");
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
  if (args.command === "ui") {
    await import("./ui.js");
    return;
  }

  await closeApplication2Pool();
}

main();
