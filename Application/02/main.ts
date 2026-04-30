import fs from "node:fs";

import { closeApplication2Pool, getApplication2Pool } from "./src/db_connect";
import { runApplication2ExportWorkflow } from "./src/workflow/export_workflow";
import type {
  Application2ExportEvent,
  Application2ExportOptions,
  Application2ExportProgressHandler,
  Application2ExportResult
} from "./src/types";

type ParsedArgs =
  | { command: "help" }
  | ({ command: "export" } & Application2ExportOptions);

function usage(exitCode = 0): never {
  const msg = `
Usage:
  node --import tsx Application/02/main.ts --help
  node --import tsx Application/02/main.ts export --run-id <uuid> --export-spec-id <uuid> --mapping-set-id <uuid> --out <path> [--json]

Application 2 status:
  Export flow is available. Database status and summary APIs are not implemented yet.
`.trim();

  fs.writeSync(1, msg + "\n");
  process.exit(exitCode);
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`export requires ${flag}`);
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new Error("A command is required: export");
  }

  const [command, ...rest] = argv;
  if (command === "-h" || command === "--help") {
    return { command: "help" };
  }

  if (command !== "export") {
    throw new Error(`Unknown command: ${command}`);
  }

  const parsed: Partial<Application2ExportOptions> = { json: false };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (arg === "-h" || arg === "--help") {
      return { command: "help" };
    }
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--run-id") {
      parsed.runId = readValue(rest, i, arg);
      i++;
    } else if (arg === "--export-spec-id") {
      parsed.exportSpecId = readValue(rest, i, arg);
      i++;
    } else if (arg === "--mapping-set-id") {
      parsed.mappingSetId = readValue(rest, i, arg);
      i++;
    } else if (arg === "--out") {
      parsed.out = readValue(rest, i, arg);
      i++;
    } else {
      throw new Error(`Unknown argument for export: ${arg}`);
    }
  }

  return {
    command: "export",
    runId: requireOption(parsed.runId, "--run-id <uuid>"),
    exportSpecId: requireOption(parsed.exportSpecId, "--export-spec-id <uuid>"),
    mappingSetId: requireOption(parsed.mappingSetId, "--mapping-set-id <uuid>"),
    out: requireOption(parsed.out, "--out <path>"),
    json: parsed.json ?? false
  };
}

function printNdjsonEvent(event: Application2ExportEvent) {
  fs.writeSync(1, JSON.stringify(event) + "\n");
}

function printStderrLine(message: string) {
  fs.writeSync(2, message + "\n");
}

function completeEvent(result: Application2ExportResult): Application2ExportEvent {
  return {
    type: "complete",
    ...result
  };
}

function recordProgressEvent(current: number, total: number): Application2ExportEvent {
  return {
    type: "record_progress",
    current,
    total
  };
}

function printHumanRecordProgress(current: number, total: number) {
  printStderrLine(`Application 2 export progress: ${current}/${total} records written.`);
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

  let poolOpened = false;

  try {
    if (args.json) {
      printNdjsonEvent({ type: "connect_start" });
    } else {
      printStderrLine("Connecting to Application 2 database...");
    }
    const pool = await getApplication2Pool();
    poolOpened = true;
    if (args.json) {
      printNdjsonEvent({ type: "connect_ok" });
    } else {
      printStderrLine("Application 2 database connection established.");
    }
    const onRecordWritten: Application2ExportProgressHandler = async ({ current, total }) => {
      if (args.json) {
        printNdjsonEvent(recordProgressEvent(current, total));
      } else {
        printHumanRecordProgress(current, total);
      }
    };
    const result = await runApplication2ExportWorkflow(pool, args, { onRecordWritten });
    if (args.json) printNdjsonEvent(completeEvent(result));
    else {
      fs.writeSync(1, `Output path: ${result.out_path}\n`);
      fs.writeSync(1, `Record count: ${result.record_count}\n`);
      fs.writeSync(1, `Export file ID: ${result.export_file_id}\n`);
      fs.writeSync(1, `Validation errors: ${result.validation_error_count}\n`);
    }
  } catch (error) {
    const message = (error as Error).message;
    if (args.json) {
      printNdjsonEvent({
        type: "error",
        ok: false,
        error: message
      });
    } else {
      if (!poolOpened) {
        printStderrLine("Application 2 database connection failed.");
      }
      fs.writeSync(2, message + "\n");
    }
    process.exitCode = 1;
  } finally {
    await closeApplication2Pool();
  }
}

main();
