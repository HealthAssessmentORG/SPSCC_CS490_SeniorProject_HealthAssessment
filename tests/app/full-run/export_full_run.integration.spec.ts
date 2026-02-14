import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { runCli } from "../../_helpers/runCli";
import { readExportSpecXlsx } from "../../../features/spec_import/spec_import_part_01_read_xlsx";

// Opt-in: this test requires a running SQL Server that matches your .env.
// Run with:
//   RUN_DB_E2E=1 npm test
const shouldRun = process.env.RUN_DB_E2E === "1";

test.describe("full pipeline export (DB)", () => {
  test.skip(!shouldRun, "Set RUN_DB_E2E=1 to enable (requires SQL Server + env vars).");

  test("generates a fixed-width export with expected record count/width", async ({}, testInfo) => {
    const xlsxPath = path.resolve(process.cwd(), "files", "ExportFixedWidthForDD2975.xlsx");
    expect(fs.existsSync(xlsxPath)).toBeTruthy();

    const spec = readExportSpecXlsx(xlsxPath, "DD2975_like", "integration");
    const outPath = testInfo.outputPath("dd2975_export.txt");

    const r = await runCli(
      [
        "--apply-schema",
        "-form",
        xlsxPath,
        "-gen",
        "5",
        "--seed",
        "12345",
        "--out",
        outPath,
      ],
      { cwd: process.cwd() }
    );

    expect(r.code).toBe(0);

    const text = await fs.promises.readFile(outPath, "utf8");
    const lines = text.trimEnd().split(/\r?\n/);

    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(line).toHaveLength(spec.row_length);
    }
  });
});
