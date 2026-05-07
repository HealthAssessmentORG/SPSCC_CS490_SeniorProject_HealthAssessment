import "dotenv/config";

import fs from "node:fs";

import { loadOutputLayout } from "./output_layout.js";
import {
  APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT,
  renderApplication3HumanReport,
  renderApplication3JsonReport
} from "./report.js";
import { validateApplication2OutputFile } from "./validator_workflow.js";

type ParsedArgs =
  | { command: "help" }
  | {
      command: "validate";
      inputPath: string;
      layoutPath: string;
      reportPath: string | undefined;
      json: boolean;
    };

function usage(exitCode = 0): never {
  const msg = `
Usage:
  node --import tsx Application/03/src/main.ts --help
  node --import tsx Application/03/src/main.ts validate --input <fixed-width-output> --layout <layout.json> [--json] [--report <path>]

Environment defaults:
  APP3_INPUT_PATH
  APP3_LAYOUT_PATH
  APP3_REPORT_PATH

Application 3 status:
  Fixed-width output validation and summary report output are available.
`.trim();

  fs.writeSync(1, msg + "\n");
  process.exit(exitCode);
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim().length === 0) return undefined;
  return value;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function requireOption(value: string | undefined, flag: string, envName: string): string {
  if (!value) {
    throw new Error(`validate requires ${flag} or ${envName}`);
  }
  return value;
}

function parseValidateArgs(rest: string[]): ParsedArgs {
  const parsed: {
    inputPath: string | undefined;
    layoutPath: string | undefined;
    reportPath: string | undefined;
    json: boolean;
  } = {
    inputPath: envValue("APP3_INPUT_PATH"),
    layoutPath: envValue("APP3_LAYOUT_PATH"),
    reportPath: envValue("APP3_REPORT_PATH"),
    json: false
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (arg === "-h" || arg === "--help") {
      return { command: "help" };
    }
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--input") {
      parsed.inputPath = readValue(rest, i, arg);
      i++;
    } else if (arg === "--layout") {
      parsed.layoutPath = readValue(rest, i, arg);
      i++;
    } else if (arg === "--report") {
      parsed.reportPath = readValue(rest, i, arg);
      i++;
    } else {
      throw new Error(`Unknown argument for validate: ${arg}`);
    }
  }

  return {
    command: "validate",
    inputPath: requireOption(parsed.inputPath, "--input <fixed-width-output>", "APP3_INPUT_PATH"),
    layoutPath: requireOption(parsed.layoutPath, "--layout <layout.json>", "APP3_LAYOUT_PATH"),
    reportPath: parsed.reportPath,
    json: parsed.json
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new Error("A command is required: validate");
  }

  const [command, ...rest] = argv;
  if (command === "-h" || command === "--help") {
    return { command: "help" };
  }

  if (command !== "validate") {
    throw new Error(`Unknown command: ${command}`);
  }

  return parseValidateArgs(rest);
}

function printJsonLine(value: unknown): void {
  fs.writeSync(1, JSON.stringify(value) + "\n");
}

function writeReportFile(path: string, content: string): void {
  fs.writeFileSync(path, content, "utf8");
}

async function runValidateCommand(args: Extract<ParsedArgs, { command: "validate" }>): Promise<void> {
  try {
    const layout = await loadOutputLayout(args.layoutPath);
    const result = await validateApplication2OutputFile({
      inputPath: args.inputPath,
      layout,
      layoutSource: args.layoutPath
    });
    const ok = result.validation_error_count === 0;
    const humanReport = renderApplication3HumanReport(result, APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT);
    const jsonReport = renderApplication3JsonReport(result, APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT);

    if (args.json) {
      printJsonLine(jsonReport);
      if (args.reportPath) {
        writeReportFile(args.reportPath, JSON.stringify(jsonReport, null, 2) + "\n");
      }
    } else {
      fs.writeSync(1, humanReport);
      if (args.reportPath) {
        writeReportFile(args.reportPath, humanReport);
      }
    }

    if (!ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) {
      printJsonLine({ ok: false, error: message });
    } else {
      fs.writeSync(2, message + "\n");
    }
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  let args: ParsedArgs;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fs.writeSync(2, `${(error as Error).message}\n`);
    usage(1);
  }

  if (args.command === "help") usage(0);
  await runValidateCommand(args);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fs.writeSync(2, message + "\n");
  process.exitCode = 1;
});
