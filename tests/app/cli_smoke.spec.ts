import { test, expect } from "@playwright/test";
import path from "node:path";
import { runCli } from "../_helpers/runCli";

test.describe("CLI smoke", () => {
  test("--help prints usage without touching DB", async () => {
    const r = await runCli(["--help"], { cwd: process.cwd() });
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain("Usage:");
    expect(r.stdout + r.stderr).toContain("Required env:");
  });

  test("missing -form fails fast", async () => {
    const r = await runCli(["-gen", "1"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Required: -form");
  });

  test("nonexistent XLSX path fails fast", async () => {
    const fakePath = path.resolve(process.cwd(), "files", "DOES_NOT_EXIST.xlsx");
    const r = await runCli(["-form", fakePath, "-gen", "1"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("File not found");
  });
});
