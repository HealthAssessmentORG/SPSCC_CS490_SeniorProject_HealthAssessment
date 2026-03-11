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
  test.describe.configure({ mode: "serial" });

  test("spec mode honors smoke XLSX metadata and formats", async ({}, testInfo) => {
    const smokeXlsx = path.resolve(process.cwd(), "files", "ExportFixedWidthForSmoke.xlsx");
    expect(fs.existsSync(smokeXlsx)).toBeTruthy();

    const spec = readExportSpecXlsx(smokeXlsx, "smoke_like", "integration_smoke");
    const outPath = testInfo.outputPath("smoke_export.txt");

    const r = await runCli(
      [
        "--apply-schema",
        "--mapping-profile",
        "spec",
        "-form",
        smokeXlsx,
        "-gen",
        "5",
        "--seed",
        "12345",
        "--spec-name",
        "smoke_like",
        "--spec-version",
        "integration_smoke",
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

    const first = lines[0]!;
    const byName = (fieldName: string) => {
      const f = spec.fields.find((x) => x.field_name === fieldName);
      expect(f).toBeTruthy();
      return first.slice((f!.start_pos - 1), f!.end_pos);
    };

    expect(byName("FORM_TYPE").trim()).toBe("CAM");
    expect(byName("FORM_VERSION").trim()).toBe("XX1999_123456");

    const id = byName("ID").trim();
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^\d+$/);

    const ok = byName("OK").trim();
    expect(["Y", "N", "U"]).toContain(ok);

    const rating = byName("RATING").trim();
    expect(["E", "V", "G", "F", "P"]).toContain(rating);
  });

  test("legacy prealpha profile preserves PRE/DD2795 form metadata", async ({}, testInfo) => {
    const ddXlsx = path.resolve(process.cwd(), "files", "ExportFixedWidthForSmoke.xlsx");
    expect(fs.existsSync(ddXlsx)).toBeTruthy();

    const spec = readExportSpecXlsx(ddXlsx, "DD2975_like", "integration_legacy");
    const outPath = testInfo.outputPath("legacy_prealpha_export.txt");

    const r = await runCli(
      [
        "--mapping-profile",
        "prealpha",
        "-form",
        ddXlsx,
        "-gen",
        "3",
        "--seed",
        "12345",
        "--spec-name",
        "DD2975_like",
        "--spec-version",
        "integration_legacy",
        "--out",
        outPath,
      ],
      { cwd: process.cwd() }
    );

    expect(r.code).toBe(0);

    const text = await fs.promises.readFile(outPath, "utf8");
    const lines = text.trimEnd().split(/\r?\n/);
    expect(lines).toHaveLength(3);

    const first = lines[0]!;
    const formType = spec.fields.find((x) => x.field_name === "FORM_TYPE");
    const formVersion = spec.fields.find((x) => x.field_name === "FORM_VERSION");
    expect(formType).toBeTruthy();
    expect(formVersion).toBeTruthy();

    const formTypeValue = first.slice(formType!.start_pos - 1, formType!.end_pos).trim();
    const formVersionValue = first.slice(formVersion!.start_pos - 1, formVersion!.end_pos).trim();

    expect(formTypeValue).toBe("PRE");
    expect(formVersionValue).toBe("DD2795_202006");
  });
});
