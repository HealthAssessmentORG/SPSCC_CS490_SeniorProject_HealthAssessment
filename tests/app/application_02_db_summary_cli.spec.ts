import { test, expect } from "@playwright/test";

import { formatDatabaseFormSummary } from "../../Application/02/src/cli/database_form_summary_format.js";
import type { Application2DatabaseFormSummary } from "../../Application/02/src/types.js";
import { runApplication2Cli } from "../_helpers/runCli.js";

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

const sampleSummary: Application2DatabaseFormSummary = {
  database: "app2_test",
  forms: [
    {
      form_name: "DD2795 202006",
      spec_name: "DD2795",
      spec_version: "202006",
      uuids: {
        export_spec_id: "spec-1",
        mapping_set_ids: ["mapping-1a", "mapping-1b"]
      },
      fields: [
        {
          field_name: "DODID",
          field_uuid: "field-1",
          field_order: 1,
          question_code: "DEM",
          start_pos: 1,
          end_pos: 10,
          field_length: 10
        },
        {
          field_name: "FORM_VERSION",
          field_uuid: "field-2",
          field_order: 2,
          question_code: null,
          start_pos: 11,
          end_pos: 20,
          field_length: 10
        }
      ]
    },
    {
      form_name: "Sparse v1",
      spec_name: "Sparse",
      spec_version: "v1",
      uuids: {
        export_spec_id: "spec-2",
        mapping_set_ids: []
      },
      fields: []
    }
  ]
};

test.describe("Application 2 db-summary CLI", () => {
  test("formats form summary as stable markdown-style text", () => {
    expect(formatDatabaseFormSummary(sampleSummary)).toBe(
      [
        "Database: app2_test",
        "Forms: 2",
        "",
        "## DD2795 202006",
        "Form UUIDs:",
        "- export_spec_id: spec-1",
        "- mapping_set_ids: mapping-1a, mapping-1b",
        "",
        "Fields:",
        "1. DODID",
        "   field_uuid: field-1",
        "   question_code: DEM",
        "   positions: 1-10",
        "   length: 10",
        "2. FORM_VERSION",
        "   field_uuid: field-2",
        "   question_code: none",
        "   positions: 11-20",
        "   length: 10",
        "",
        "## Sparse v1",
        "Form UUIDs:",
        "- export_spec_id: spec-2",
        "- mapping_set_ids: none",
        "",
        "Fields:",
        "(none)",
        ""
      ].join("\n")
    );
  });

  test("unknown db-summary arguments fail before opening the database", async () => {
    const r = await runApplication2Cli(["db-summary", "--out", "./out/summary.md"], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Unknown argument for db-summary: --out");
    expect(r.stderr).not.toContain("APP2_DB_SERVER");
    expect(r.stdout).toContain("Usage:");
  });

  test("db-summary reports missing APP2 DB env as sanitized human-readable stderr", async () => {
    const r = await runApplication2Cli(["db-summary"], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("application2 DB server is required (APP2_DB_SERVER)\n");
    expect(r.stderr).not.toContain("Application 2 database connection failed.");
    expect(r.stderr).not.toContain("EXPORT_DB_SERVER");
  });

  test("db-summary --json reports missing APP2 DB env as one JSON object", async () => {
    const r = await runApplication2Cli(["db-summary", "--json"], {
      cwd: process.cwd(),
      env: clearedDbEnv
    });

    expect(r.code).toBe(1);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(
      '{"ok":false,"error":"application2 DB server is required (APP2_DB_SERVER)"}\n'
    );
    expect(JSON.parse(r.stdout)).toEqual({
      ok: false,
      error: "application2 DB server is required (APP2_DB_SERVER)"
    });
  });
});
