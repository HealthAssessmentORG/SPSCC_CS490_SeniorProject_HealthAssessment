import { test, expect } from "@playwright/test";
import fs from "node:fs";

import { runApplication2Cli } from "../_helpers/runCli";

const shouldRun = process.env.RUN_APP2_DB_E2E === "1";

test.describe("Application 2 export flow (DB)", () => {
  test.skip(!shouldRun, "Set RUN_APP2_DB_E2E=1 to enable (requires APP2_DB_* env vars).");
  test.describe.configure({ mode: "serial" });

  test("exports an existing run using explicit IDs", async ({}, testInfo) => {
    const runId = process.env.APP2_E2E_RUN_ID;
    const exportSpecId = process.env.APP2_E2E_EXPORT_SPEC_ID;
    const mappingSetId = process.env.APP2_E2E_MAPPING_SET_ID;
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
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      run_id: string;
      export_file_id: string;
      record_count: number;
      out_path: string;
      validation_error_count: number;
    };

    expect(payload).toMatchObject({
      ok: true,
      run_id: runId,
      out_path: outPath
    });
    expect(payload.export_file_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.record_count).toBeGreaterThanOrEqual(0);
    expect(payload.validation_error_count).toBeGreaterThanOrEqual(0);
    await expect(fs.promises.stat(outPath)).resolves.toBeTruthy();
  });
});
