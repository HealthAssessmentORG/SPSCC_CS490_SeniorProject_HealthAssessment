import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";

import { runCli } from "../_helpers/runCli.js";

const clearedApp3Env = {
  APP3_INPUT_PATH: "",
  APP3_LAYOUT_PATH: "",
  APP3_REPORT_PATH: "",
  APP3_MAX_DISPLAY_LINES: ""
};

async function runApplication3Cli(args: string[], env: Record<string, string | undefined> = {}) {
  return await runCli(args, {
    cwd: process.cwd(),
    entry: "Application/03/src/main.ts",
    env: { ...clearedApp3Env, ...env }
  });
}

async function writeLayout(path: string): Promise<void> {
  await fs.writeFile(
    path,
    JSON.stringify({
      row_length: 18,
      fields: [
        { field_name: "DODID", start_pos: 1, length: 10, domain_type: "DODID10" },
        { field_name: "DATE", start_pos: 11, length: 8, domain_type: "DATE_YYYYMMDD" }
      ]
    }),
    "utf8"
  );
}

async function writeOutput(path: string, lines: string[]): Promise<void> {
  await fs.writeFile(path, lines.map((line) => `${line}\n`).join(""), "utf8");
}

test.describe("Application 3 CLI", () => {
  test("--help prints usage", async () => {
    const result = await runApplication3Cli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Application/03/src/main.ts validate");
    expect(result.stdout).toContain("--input <fixed-width-output>");
    expect(result.stdout).toContain("--layout <layout.json>");
    expect(result.stdout).toContain("APP3_INPUT_PATH");
    expect(result.stdout).toContain("APP3_LAYOUT_PATH");
  });

  test("missing input fails before reading files", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    await writeLayout(layoutPath);

    const result = await runApplication3Cli(["validate", "--layout", layoutPath]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("validate requires --input <fixed-width-output> or APP3_INPUT_PATH");
    expect(result.stdout).toContain("Usage:");
  });

  test("valid output prints a concise human summary", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("valid.txt");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["123456789020260214"]);

    const result = await runApplication3Cli(["validate", "--input", inputPath, "--layout", layoutPath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        "Application 3 validation report",
        `Input path: ${inputPath}`,
        `Layout: ${layoutPath}`,
        "Records checked: 1",
        "Validation errors: 0",
        "Validation result: passed",
        "Error counts: none",
        "Error sample: none",
        ""
      ].join("\n")
    );
  });

  test("invalid output prints summary and exits nonzero", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("invalid.txt");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["ABCDEF12342026AB14"]);

    const result = await runApplication3Cli(["validate", "--input", inputPath, "--layout", layoutPath]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Validation errors: 2");
    expect(result.stdout).toContain("Validation result: failed");
    expect(result.stdout).toContain("- BAD_DATE: 1");
    expect(result.stdout).toContain("- BAD_DODID10: 1");
    expect(result.stdout).toContain("Error sample (first 5):");
    expect(result.stdout).toContain("record 1 DODID BAD_DODID10");
  });

  test("json mode prints one machine-readable object", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("valid_json.txt");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["123456789020260214"]);

    const result = await runApplication3Cli(["validate", "--input", inputPath, "--layout", layoutPath, "--json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.endsWith("\n")).toBeTruthy();
    expect(result.stdout.trimEnd().split(/\r?\n/)).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      input_path: inputPath,
      layout_source: layoutPath,
      records_checked: 1,
      validation_error_count: 0,
      validation_result: "passed",
      error_counts: [],
      error_sample_limit: 5,
      error_sample_truncated: false,
      error_sample: []
    });
  });

  test("writes human report file when --report is provided", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("valid_report.txt");
    const reportPath = testInfo.outputPath("report.txt");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["123456789020260214"]);

    const result = await runApplication3Cli([
      "validate",
      "--input",
      inputPath,
      "--layout",
      layoutPath,
      "--report",
      reportPath
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    await expect(fs.readFile(reportPath, "utf8")).resolves.toBe(result.stdout);
  });

  test("writes JSON report file in json mode when --report is provided", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("valid_json_report.txt");
    const reportPath = testInfo.outputPath("report.json");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["123456789020260214"]);

    const result = await runApplication3Cli([
      "validate",
      "--input",
      inputPath,
      "--layout",
      layoutPath,
      "--json",
      "--report",
      reportPath
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(await fs.readFile(reportPath, "utf8"))).toEqual(JSON.parse(result.stdout));
  });

  test("uses APP3_REPORT_PATH default", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("env_report_valid.txt");
    const reportPath = testInfo.outputPath("env_report.txt");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["123456789020260214"]);

    const result = await runApplication3Cli(["validate", "--input", inputPath, "--layout", layoutPath], {
      APP3_REPORT_PATH: reportPath
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    await expect(fs.readFile(reportPath, "utf8")).resolves.toBe(result.stdout);
  });

  test("uses APP3_INPUT_PATH and APP3_LAYOUT_PATH defaults", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    const inputPath = testInfo.outputPath("env_valid.txt");
    await writeLayout(layoutPath);
    await writeOutput(inputPath, ["123456789020260214"]);

    const result = await runApplication3Cli(["validate"], {
      APP3_INPUT_PATH: inputPath,
      APP3_LAYOUT_PATH: layoutPath
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Input path: ${inputPath}`);
    expect(result.stdout).toContain(`Layout: ${layoutPath}`);
  });

  test("explicit flags take priority over APP3 defaults", async ({}, testInfo) => {
    const envLayoutPath = testInfo.outputPath("env_layout.json");
    const envInputPath = testInfo.outputPath("env_invalid.txt");
    const cliLayoutPath = testInfo.outputPath("cli_layout.json");
    const cliInputPath = testInfo.outputPath("cli_valid.txt");
    await writeLayout(envLayoutPath);
    await writeLayout(cliLayoutPath);
    await writeOutput(envInputPath, ["ABCDEF12342026AB14"]);
    await writeOutput(cliInputPath, ["123456789020260214"]);

    const result = await runApplication3Cli(["validate", "--input", cliInputPath, "--layout", cliLayoutPath], {
      APP3_INPUT_PATH: envInputPath,
      APP3_LAYOUT_PATH: envLayoutPath
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Input path: ${cliInputPath}`);
    expect(result.stdout).toContain(`Layout: ${cliLayoutPath}`);
    expect(result.stdout).toContain("Validation result: passed");
  });
});
