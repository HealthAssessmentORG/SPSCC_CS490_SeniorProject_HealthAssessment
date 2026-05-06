import "dotenv/config";

import fs from "node:fs";

import { closePool, getPool } from "./db/db_connect.js";
import {
  runAlpha1Command,
  type Alpha1CommandOptions,
  type Alpha1CommandResult,
  type Alpha1FieldRow
} from "./features/alpha1/alpha1_part_01_workflow.js";

type InspectArgs = {
  command: "check-db" | "fields";
  help: boolean;
  json: boolean;
};

type GenerateArgs = {
  command: "generate";
  help: boolean;
  json: boolean;
  gen: number;
  seed: number;
  dryRun: boolean;
};

type ParsedArgs = InspectArgs | GenerateArgs;

function usage(exitCode = 0): never {
  const msg = `
Usage:
  node --import tsx main.ts check-db [--json]
  node --import tsx main.ts fields [--json]
  node --import tsx main.ts generate -gen <N> [--seed <n>] [--dry-run] [--json]

Required env:
  DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD

Optional env:
  DB_PORT=1433
  DB_ENCRYPT=false
  DB_TRUST_SERVER_CERTIFICATE=true
  DB_REQUEST_TIMEOUT_MS=0
`.trim();

  fs.writeSync(1, msg + "\n");
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new Error("A command is required: check-db, fields, or generate");
  }

  const [command, ...rest] = argv;
  if (command === "-h" || command === "--help") {
    return { command: "check-db", help: true, json: false };
  }

  if (command !== "check-db" && command !== "fields" && command !== "generate") {
    throw new Error(`Unknown command: ${command}`);
  }

  if (command !== "generate") {
    const parsed: InspectArgs = { command, help: false, json: false };

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") parsed.help = true;
      else if (arg === "--json") parsed.json = true;
      else throw new Error(`Unknown argument for ${command}: ${arg}`);
    }

    return parsed;
  }

  const parsed: GenerateArgs = {
    command,
    help: false,
    json: false,
    gen: 0,
    seed: 12345,
    dryRun: false
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (arg === "-h" || arg === "--help") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "-gen" || arg === "--gen") parsed.gen = Number(rest[++i]);
    else if (arg === "--seed") parsed.seed = Number(rest[++i]);
    else throw new Error(`Unknown argument for generate: ${arg}`);
  }

  return parsed;
}

function printJson(value: unknown) {
  fs.writeSync(1, JSON.stringify(value, null, 2) + "\n");
}

function printFields(fields: Alpha1FieldRow[]) {
  if (fields.length === 0) {
    console.log("No FIELD rows found.");
    return;
  }

  for (const field of fields) {
    console.log(`${field.field_id}\t${field.field_code}\t${field.field_name}`);
  }
}

function toAlpha1CommandOptions(args: ParsedArgs): Alpha1CommandOptions {
  if (args.command === "generate") {
    return {
      command: "generate",
      gen: args.gen,
      seed: args.seed,
      dryRun: args.dryRun
    };
  }

  return { command: args.command };
}

function printAlpha1CommandResult(args: ParsedArgs, commandResult: Alpha1CommandResult) {
  if (commandResult.command === "check-db") {
    const result = commandResult.result;
    if (args.json) {
      printJson(result);
      return;
    }

    console.log(`DB OK: ${result.database}`);
    console.log(`Tables: ${Object.entries(result.tables).filter(([, ok]) => ok).map(([name]) => name).join(", ")}`);
    console.log(`FIELD rows: ${result.field_count}`);
    return;
  }

  if (commandResult.command === "fields") {
    if (args.json) printJson(commandResult.fields);
    else printFields(commandResult.fields);
    return;
  }

  if (args.json) {
    printJson(commandResult.result);
    return;
  }

  if (commandResult.dryRun) {
    console.log(`Generated ${commandResult.result.length} assessment preview(s).`);
    return;
  }

  console.log(`Inserted ${commandResult.result.length} assessment(s).`);
  for (const row of commandResult.result) {
    console.log(`assessment_id=${row.assessment_id} responses=${row.response_count}`);
  }
}

async function main() {
  let args: ParsedArgs;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fs.writeSync(2, `${(error as Error).message}\n`);
    usage(1);
  }

  if (args.help) usage(0);

  if (args.command === "generate" && (!Number.isInteger(args.gen) || args.gen <= 0)) {
    fs.writeSync(2, "generate requires -gen <positive integer>\n");
    process.exit(1);
  }

  try {
    const pool = await getPool("alpha1");
    const result = await runAlpha1Command(pool, toAlpha1CommandOptions(args));
    printAlpha1CommandResult(args, result);
  } catch (error) {
    const message = (error as Error).message;
    if (args.json) {
      fs.writeSync(2, JSON.stringify({ ok: false, error: message }, null, 2) + "\n");
    } else {
      fs.writeSync(2, message + "\n");
    }
    process.exitCode = 1;
  } finally {
    await closePool("alpha1");
  }
}

main();
