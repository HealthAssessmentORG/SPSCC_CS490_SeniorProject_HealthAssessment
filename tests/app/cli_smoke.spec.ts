import { test, expect } from "@playwright/test";
import path from "node:path";
import { runExportCli } from "../_helpers/runCli";

test.describe("CLI smoke", () => {
  const validFormPath = path.resolve(process.cwd(), "files", "ExportFixedWidthForSmoke.xlsx");

  test("--help prints usage without touching DB", async () => {
    const r = await runExportCli(["--help"], { cwd: process.cwd() });
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain("Usage:");
    expect(r.stdout + r.stderr).toContain("Required env:");
  });

  test("unknown argument fails fast", async () => {
    const r = await runExportCli(["--definitely-not-a-real-flag"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Unknown argument");
  });

  test("invalid --mapping-profile fails fast", async () => {
    const r = await runExportCli(["--mapping-profile", "bogus"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Invalid --mapping-profile");
    expect(r.stdout + r.stderr).toContain("spec|prealpha");
  });

  test("missing -form fails fast", async () => {
    const r = await runExportCli(["-gen", "1"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Required: -form");
  });

  test("missing -gen fails fast", async () => {
    const r = await runExportCli(["-form", validFormPath], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Required: -gen");
  });

  test("-gen 0 fails fast", async () => {
    const r = await runExportCli(["-form", validFormPath, "-gen", "0"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Required: -gen");
  });

  test("non-integer -gen fails fast", async () => {
    const r = await runExportCli(["-form", validFormPath, "-gen", "not-a-number"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Required: -gen");
  });

  test("nonexistent XLSX path fails fast", async () => {
    const fakePath = path.resolve(process.cwd(), "files", "DOES_NOT_EXIST.xlsx");
    const r = await runExportCli(["-form", fakePath, "-gen", "1"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("File not found");
  });
});
