import { test, expect } from "@playwright/test";

import { runApplication2Cli } from "../_helpers/runCli";

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
  EXPORT_DB_REQUEST_TIMEOUT_MS: "",
  APP2_DB_SERVER: "",
  APP2_DB_PORT: "",
  APP2_DB_DATABASE: "",
  APP2_DB_USER: "",
  APP2_DB_PASSWORD: "",
  APP2_DB_ENCRYPT: "",
  APP2_DB_TRUST_SERVER_CERTIFICATE: "",
  APP2_DB_REQUEST_TIMEOUT_MS: ""
};

const validExportArgs = [
  "export",
  "--run-id",
  "11111111-1111-1111-1111-111111111111",
  "--export-spec-id",
  "22222222-2222-2222-2222-222222222222",
  "--mapping-set-id",
  "33333333-3333-3333-3333-333333333333",
  "--out",
  "./out/application_02_export.txt"
];

function parseNdjson(text: string) {
  const trimmed = text.trimEnd();
  expect(trimmed).not.toBe("");
  const lines = trimmed.split(/\r?\n/);
  return {
    lines,
    events: lines.map((line) => JSON.parse(line))
  };
}

test.describe("Application 2 CLI", () => {
  test("--help prints usage and available commands", async () => {
    const r = await runApplication2Cli(["--help"], { cwd: process.cwd(), env: clearedDbEnv });

    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("Application/02/main.ts export");
    expect(r.stdout).toContain("Application/02/main.ts db-summary [--json]");
    expect(r.stdout).toContain("--run-id <uuid>");
    expect(r.stdout).toContain("--export-spec-id <uuid>");
    expect(r.stdout).toContain("--mapping-set-id <uuid>");
    expect(r.stdout).toContain("--out <path>");
    expect(r.stdout).toContain("Export flow is available");
    expect(r.stdout).toContain("Database status and summary APIs are available.");
  });

  test("unknown command fails fast", async () => {
    const r = await runApplication2Cli(["status"], { cwd: process.cwd(), env: clearedDbEnv });

    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Unknown command: status");
    expect(r.stdout).toContain("Usage:");
  });

  test("missing export args fail before placeholder workflow", async () => {
    const r = await runApplication2Cli(["export", "--run-id", validExportArgs[2]], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    expect(r.code).toBe(1);
    expect(r.stderr).toContain("export requires --export-spec-id <uuid>");
    expect(r.stderr).not.toContain("Application 2 export workflow is not implemented yet.");
    expect(r.stderr).not.toContain("APP2_DB_SERVER");
  });

  test("unknown export argument fails fast", async () => {
    const r = await runApplication2Cli(["export", "--definitely-not-real"], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Unknown argument for export: --definitely-not-real");
  });

  test("valid export command reaches APP2 DB layer without reading root DB env", async () => {
    const r = await runApplication2Cli(validExportArgs, { cwd: process.cwd(), env: clearedDbEnv });

    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("Connecting to Application 2 database...");
    expect(r.stderr).toContain("Application 2 database connection failed.");
    expect(r.stderr).toContain("application2 DB server is required");
    expect(r.stderr).toContain("APP2_DB_SERVER");
    expect(r.stderr).not.toContain("EXPORT_DB_SERVER");
    expect(r.stderr).not.toContain("{");
  });

  test("valid export command supports json error shape for DB config failures", async () => {
    const r = await runApplication2Cli([...validExportArgs, "--json"], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    expect(r.code).toBe(1);
    expect(r.stderr).toBe("");
    expect(r.stdout.endsWith("\n")).toBeTruthy();

    const { lines, events } = parseNdjson(r.stdout);
    expect(lines).toEqual([
      '{"type":"connect_start"}',
      '{"type":"error","ok":false,"error":"application2 DB server is required (APP2_DB_SERVER)"}'
    ]);
    expect(events).toEqual([
      { type: "connect_start" },
      {
        type: "error",
        ok: false,
        error: "application2 DB server is required (APP2_DB_SERVER)"
      }
    ]);
  });

  test("valid export command does not emit record_progress before the connection succeeds", async () => {
    const r = await runApplication2Cli([...validExportArgs, "--json"], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    const { events } = parseNdjson(r.stdout);
    expect(events.some((event: { type: string }) => event.type === "record_progress")).toBe(false);
  });
});
