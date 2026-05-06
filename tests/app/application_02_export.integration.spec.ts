import { test, expect } from "@playwright/test";
import fs from "node:fs";

import { runApplication2Cli } from "../_helpers/runCli.js";

const shouldRun = process.env["RUN_APP2_DB_E2E"] === "1";

test.describe("Application 2 export flow (DB)", () => {
  test.skip(!shouldRun, "Set RUN_APP2_DB_E2E=1 to enable (requires APP2_DB_* env vars).");
  test.describe.configure({ mode: "serial" });

  test("exports an existing run using explicit IDs", async ({}, testInfo) => {
    const runId = process.env["APP2_E2E_RUN_ID"];
    const exportSpecId = process.env["APP2_E2E_EXPORT_SPEC_ID"];
    const mappingSetId = process.env["APP2_E2E_MAPPING_SET_ID"];
    test.skip(
      !runId || !exportSpecId || !mappingSetId,
      "Set APP2_E2E_RUN_ID, APP2_E2E_EXPORT_SPEC_ID, and APP2_E2E_MAPPING_SET_ID to run export flow."
    );

    const outPath = testInfo.outputPath("application_02_export.txt");
    const result = await runApplication2Cli(
      [
        "export",
        "--run-id",
        runId!,
        "--export-spec-id",
        exportSpecId!,
        "--mapping-set-id",
        mappingSetId!,
        "--out",
        outPath,
        "--json"
      ],
      { cwd: process.cwd() }
    );

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("Connecting to Application 2 database...");
    expect(result.stderr).not.toContain("Application 2 database connection established.");
    expect(result.stderr).not.toContain("Application 2 database connection failed.");
    expect(result.stdout.endsWith("\n")).toBeTruthy();
    const lines = result.stdout.trimEnd().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe('{"type":"connect_start"}');
    expect(lines[1]).toBe('{"type":"connect_ok"}');

    const events = lines.map((line) => JSON.parse(line));
    const complete = events[events.length - 1] as {
      type: string;
      ok: boolean;
      run_id: string;
      export_file_id: string;
      record_count: number;
      out_path: string;
      validation_error_count: number;
    };
    const progressEvents = events.slice(2, -1) as Array<{
      type: string;
      current: number;
      total: number;
    }>;

    expect(Object.keys(complete)).toEqual([
      "type",
      "ok",
      "run_id",
      "export_file_id",
      "record_count",
      "out_path",
      "validation_error_count"
    ]);
    expect(complete).toMatchObject({
      type: "complete",
      ok: true,
      run_id: runId,
      out_path: outPath
    });
    expect(complete.export_file_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(complete.record_count).toBeGreaterThanOrEqual(0);
    expect(complete.validation_error_count).toBeGreaterThanOrEqual(0);
    expect(progressEvents).toHaveLength(complete.record_count);
    expect(progressEvents.every((event) => event.type === "record_progress")).toBeTruthy();
    expect(progressEvents.every((event) => event.total === complete.record_count)).toBeTruthy();
    expect(progressEvents.map((event) => event.current)).toEqual(
      Array.from({ length: complete.record_count }, (_, index) => index + 1)
    );
    await expect(fs.promises.stat(outPath)).resolves.toBeTruthy();
  });

  test("non-json export prints only the final summary lines on stdout", async ({}, testInfo) => {
    const runId = process.env["APP2_E2E_RUN_ID"];
    const exportSpecId = process.env["APP2_E2E_EXPORT_SPEC_ID"];
    const mappingSetId = process.env["APP2_E2E_MAPPING_SET_ID"];
    test.skip(
      !runId || !exportSpecId || !mappingSetId,
      "Set APP2_E2E_RUN_ID, APP2_E2E_EXPORT_SPEC_ID, and APP2_E2E_MAPPING_SET_ID to run export flow."
    );

    const outPath = testInfo.outputPath("application_02_export_human.txt");
    const result = await runApplication2Cli(
      [
        "export",
        "--run-id",
        runId!,
        "--export-spec-id",
        exportSpecId!,
        "--mapping-set-id",
        mappingSetId!,
        "--out",
        outPath
      ],
      { cwd: process.cwd() }
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("Connecting to Application 2 database...");
    expect(result.stderr).toContain("Application 2 database connection established.");
    expect(result.stderr).not.toContain("Application 2 database connection failed.");
    expect(result.stdout).not.toContain("{");

    const lines = result.stdout.trimEnd().split(/\r?\n/);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(`Output path: ${outPath}`);
    expect(lines[1]).toMatch(/^Record count: \d+$/);
    expect(lines[2]).toMatch(/^Export file ID: [0-9a-f-]{36}$/);
    expect(lines[3]).toMatch(/^Validation errors: \d+$/);

    const recordCount = Number(lines[1]!.replace("Record count: ", ""));
    const stderrLines = result.stderr.trimEnd().split(/\r?\n/);
    expect(stderrLines[0]).toBe("Connecting to Application 2 database...");
    expect(stderrLines[1]).toBe("Application 2 database connection established.");
    expect(stderrLines.slice(2).join("\n")).toBe(
      Array.from(
        { length: recordCount },
        (_, index) => `\rApplication 2 export progress: ${index + 1}/${recordCount} records written.`
      ).join("")
    );
    await expect(fs.promises.stat(outPath)).resolves.toBeTruthy();
  });
});
