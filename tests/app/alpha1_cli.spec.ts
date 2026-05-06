import { test, expect } from "@playwright/test";

import { runCli } from "../_helpers/runCli.js";

const clearedDbEnv = {
  DB_SERVER: "",
  DB_PORT: "",
  DB_DATABASE: "",
  DB_USER: "",
  DB_PASSWORD: "",
  DB_ENCRYPT: "",
  DB_TRUST_SERVER_CERTIFICATE: "",
  DB_REQUEST_TIMEOUT_MS: "",
  EXPORT_DB_SERVER: "",
  EXPORT_DB_PORT: "",
  EXPORT_DB_DATABASE: "",
  EXPORT_DB_USER: "",
  EXPORT_DB_PASSWORD: "",
  EXPORT_DB_ENCRYPT: "",
  EXPORT_DB_TRUST_SERVER_CERTIFICATE: "",
  EXPORT_DB_REQUEST_TIMEOUT_MS: ""
};

const shouldRunDbCli = process.env["RUN_ALPHA1_DB_E2E"] === "1";

test.describe("alpha1 CLI", () => {
  test("--help prints usage", async () => {
    const r = await runCli(["--help"], { cwd: process.cwd() });
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain("check-db");
    expect(r.stdout + r.stderr).toContain("generate -gen <N>");
  });

  test("unknown command fails fast", async () => {
    const r = await runCli(["unknown-command"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("Unknown command");
  });

  test("generate without -gen fails fast", async () => {
    const r = await runCli(["generate"], { cwd: process.cwd() });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("generate requires -gen <positive integer>");
  });

  test("check-db reports missing env clearly", async () => {
    const r = await runCli(["check-db", "--json"], { cwd: process.cwd(), env: clearedDbEnv });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("alpha1 DB server is required");
    expect(r.stderr).toContain("DB_SERVER");
  });

  test("check-db reports missing tables when pointed at master", async () => {
    test.skip(!shouldRunDbCli, "Set RUN_ALPHA1_DB_E2E=1 to enable live alpha1 CLI checks.");

    const r = await runCli(["check-db", "--json"], {
      cwd: process.cwd(),
      env: { DB_DATABASE: "master" }
    });

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Connected to database "master"');
    expect(r.stderr).toContain("Missing required tables");
  });

  test("fields --json returns the dynamic field list shape", async () => {
    test.skip(!shouldRunDbCli, "Set RUN_ALPHA1_DB_E2E=1 to enable live alpha1 CLI checks.");

    const r = await runCli(["fields", "--json"], { cwd: process.cwd() });
    expect(r.code).toBe(0);

    const payload = JSON.parse(r.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(payload)).toBeTruthy();
    if (payload.length > 0) {
      expect(payload[0]).toHaveProperty("field_id");
      expect(payload[0]).toHaveProperty("field_code");
      expect(payload[0]).toHaveProperty("field_name");
    }
  });

  test("generate --dry-run --json returns sane preview values", async () => {
    test.skip(!shouldRunDbCli, "Set RUN_ALPHA1_DB_E2E=1 to enable live alpha1 CLI checks.");

    const r = await runCli(["generate", "-gen", "1", "--seed", "123", "--dry-run", "--json"], {
      cwd: process.cwd()
    });
    expect(r.code).toBe(0);

    const payload = JSON.parse(r.stdout) as Array<{ assessment_index: number; fields: Array<{ field_name: string; response: string }> }>;
    expect(payload).toHaveLength(1);
    const firstAssessment = payload[0]!;
    expect(firstAssessment).toHaveProperty("assessment_index", 1);
    expect(Array.isArray(firstAssessment.fields)).toBeTruthy();

    const byName = (fieldName: string) => firstAssessment.fields.find((field) => field.field_name === fieldName)?.response;
    const middleInitial = byName("Deployer Middle Initial");
    const deploymentDate = byName("Estimated Date of Upcoming Deployment");
    const completedDate = byName("Date Completed");
    const email = byName("Deployer Email");

    expect(middleInitial).toBeDefined();
    expect(deploymentDate).toBeDefined();
    expect(completedDate).toBeDefined();
    expect(email).toBeDefined();
    expect(middleInitial!).toMatch(/^[A-Z]$/);
    expect(deploymentDate!).toMatch(/^\d{8}$/);
    expect(completedDate!).toMatch(/^\d{8}$/);
    expect(email!).toMatch(/^user\d{6}@example\.mil$/);
  });
});
