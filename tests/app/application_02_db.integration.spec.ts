import { test, expect } from "@playwright/test";

import {
  closeApplication2Pool,
  execSql,
  getApplication2Pool
} from "../../Application/02/src/db/db_connect.js";

const shouldRun = process.env["RUN_APP2_DB_E2E"] === "1";

test.describe("Application 2 live DB verification", () => {
  test.skip(!shouldRun, "Set RUN_APP2_DB_E2E=1 to enable (requires APP2_DB_*, EXPORT_DB_*, or DB_* env vars).");
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
            'FIELD',
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
        "FIELD",
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

    const views = await execSql(
      pool,
      `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = 'vw_Response'
      `
    );
    expect((views.recordset as Array<{ TABLE_NAME: string }>).map((row) => row.TABLE_NAME)).toEqual(["vw_Response"]);
  });

  test("matches the updated App2 database contract", async () => {
    const pool = await getApplication2Pool();
    const columns = await execSql(
      pool,
      `
        SELECT
          TABLE_NAME,
          COLUMN_NAME,
          DATA_TYPE,
          COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS is_identity
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND (
            (TABLE_NAME = 'ASSESSMENT' AND COLUMN_NAME = 'assessment_id')
            OR (TABLE_NAME = 'RESPONSE' AND COLUMN_NAME IN ('deployer_response_id', 'assessment_id'))
            OR (TABLE_NAME = 'FIELD' AND COLUMN_NAME IN ('field_code', 'field_name', 'question'))
            OR (TABLE_NAME = 'vw_Response' AND COLUMN_NAME IN (
              'assessment_id',
              'response_id',
              'question_code',
              'field_name',
              'value_raw',
              'value_norm'
            ))
          )
      `
    );

    const byColumn = new Map(
      (
        columns.recordset as Array<{
          TABLE_NAME: string;
          COLUMN_NAME: string;
          DATA_TYPE: string;
          is_identity: number;
        }>
      ).map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row])
    );

    expect(byColumn.get("ASSESSMENT.assessment_id")).toMatchObject({ DATA_TYPE: "bigint", is_identity: 1 });
    expect(byColumn.get("RESPONSE.deployer_response_id")).toMatchObject({ DATA_TYPE: "bigint", is_identity: 1 });
    expect(byColumn.get("RESPONSE.assessment_id")).toMatchObject({ DATA_TYPE: "bigint", is_identity: 0 });
    expect(byColumn.get("FIELD.field_code")).toMatchObject({ DATA_TYPE: "char" });
    expect(byColumn.get("FIELD.field_name")).toMatchObject({ DATA_TYPE: "varchar" });
    expect(byColumn.get("FIELD.question")).toMatchObject({ DATA_TYPE: "varchar" });
    expect(byColumn.get("vw_Response.assessment_id")).toMatchObject({ DATA_TYPE: "bigint" });
    expect(byColumn.get("vw_Response.response_id")).toMatchObject({ DATA_TYPE: "bigint" });

    const fieldUniqueColumns = await execSql(
      pool,
      `
        SELECT kcu.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kcu
          ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
          AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = 'dbo'
          AND tc.TABLE_NAME = 'FIELD'
          AND tc.CONSTRAINT_TYPE = 'UNIQUE'
        ORDER BY kcu.COLUMN_NAME
      `
    );

    expect((fieldUniqueColumns.recordset as Array<{ COLUMN_NAME: string }>).map((row) => row.COLUMN_NAME)).toEqual([
      "field_name"
    ]);
  });
});
