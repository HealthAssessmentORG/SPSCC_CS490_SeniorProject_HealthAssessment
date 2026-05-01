import { test, expect } from "@playwright/test";

import {
  closeApplication2Pool,
  execSql,
  getApplication2Pool
} from "../../Application/02/src/db/db_connect";

const shouldRun = process.env.RUN_APP2_DB_E2E === "1";

test.describe("Application 2 live DB verification", () => {
  test.skip(!shouldRun, "Set RUN_APP2_DB_E2E=1 to enable (requires APP2_DB_* env vars).");
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await closeApplication2Pool();
  });

  test("connects and finds required export-flow tables", async () => {
    const pool = await getApplication2Pool();
    const result = await execSql(
      pool,
      `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME IN (
            'RUN',
            'ASSESSMENT',
            'DEPLOYER',
            'RESPONSE',
            'PROVIDER_REVIEW',
            'EXPORT_SPEC',
            'EXPORT_FIELD',
            'MAPPING_SET',
            'MAPPING_RULE',
            'EXPORT_FILE',
            'VALIDATION_ERROR'
          )
      `
    );

    const found = new Set((result.recordset as Array<{ TABLE_NAME: string }>).map((row) => row.TABLE_NAME));
    expect(found).toEqual(
      new Set([
        "RUN",
        "ASSESSMENT",
        "DEPLOYER",
        "RESPONSE",
        "PROVIDER_REVIEW",
        "EXPORT_SPEC",
        "EXPORT_FIELD",
        "MAPPING_SET",
        "MAPPING_RULE",
        "EXPORT_FILE",
        "VALIDATION_ERROR"
      ])
    );
  });
});
