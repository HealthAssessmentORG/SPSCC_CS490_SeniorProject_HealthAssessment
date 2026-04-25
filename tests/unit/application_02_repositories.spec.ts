import { test, expect } from "@playwright/test";

import type { DbPool } from "../../Application/02/src/db/db_connect";
import { createExportFile } from "../../Application/02/src/repositories/export_file_repository";
import { loadExportRecordContext } from "../../Application/02/src/repositories/export_repository";
import {
  loadExportFields,
  loadExportSpecLayout,
  loadRawMappingRules
} from "../../Application/02/src/repositories/mapping_repository";
import { loadRunSummary, loadValidationErrorCounts } from "../../Application/02/src/repositories/report_repository";
import { loadAssessmentIdsForRun, updateRunStatus } from "../../Application/02/src/repositories/run_repository";
import { persistValidationErrors } from "../../Application/02/src/repositories/validation_repository";

type QueryCall = {
  text: string;
  inputs: Array<{ name: string; value: unknown }>;
};

function fakePool(recordsets: Array<Array<Record<string, unknown>>>) {
  const calls: QueryCall[] = [];

  const pool = {
    request() {
      const inputs: Array<{ name: string; value: unknown }> = [];
      return {
        input(name: string, _type: unknown, value: unknown) {
          inputs.push({ name, value });
          return this;
        },
        async query(text: string) {
          calls.push({ text, inputs: [...inputs] });
          return { recordset: recordsets.shift() ?? [] };
        }
      };
    }
  } as unknown as DbPool;

  return { pool, calls };
}

test.describe("Application 2 repositories", () => {
  test("loads export record context and response map", async () => {
    const { pool, calls } = fakePool([
      [{ assessment_id: "a1", deployer_id: "d1" }],
      [{ deployer_id: "d1", dod_id: "1234567890" }],
      [{ assessment_id: "a1", provider_name: "Provider" }],
      [
        { question_code: "DEM", field_name: "EMAIL", value_norm: "USER@EXAMPLE.MIL" },
        { question_code: "DEM", field_name: "EMPTY", value_norm: null }
      ]
    ]);

    const context = await loadExportRecordContext(pool, "a1");

    expect(context.assessment).toMatchObject({ assessment_id: "a1" });
    expect(context.deployer).toMatchObject({ deployer_id: "d1" });
    expect(context.provider_review).toMatchObject({ provider_name: "Provider" });
    expect([...context.responses.entries()]).toEqual([
      ["DEM:EMAIL", "USER@EXAMPLE.MIL"],
      ["DEM:EMPTY", ""]
    ]);

    expect(calls).toHaveLength(4);
    expect(calls[0]!.text).toContain("FROM dbo.ASSESSMENT");
    expect(calls[1]!.text).toContain("JOIN dbo.ASSESSMENT");
    expect(calls[2]!.text).toContain("FROM dbo.PROVIDER_REVIEW");
    expect(calls[3]!.text).toContain("FROM dbo.RESPONSE");
    for (const call of calls) {
      expect(call.inputs).toEqual([{ name: "id", value: "a1" }]);
    }
  });

  test("loads and normalizes export fields", async () => {
    const { pool, calls } = fakePool([
      [{ export_spec_id: "spec1", row_length: "42" }],
      [
        {
          export_field_id: "f1",
          field_name: "FORM_TYPE",
          start_pos: "1",
          end_pos: "3",
          field_length: "3",
          domain_type: null
        },
        {
          export_field_id: "f2",
          field_name: "DODID",
          start_pos: 4,
          end_pos: 13,
          field_length: 10,
          domain_type: "DODID10"
        }
      ]
    ]);

    await expect(loadExportSpecLayout(pool, "spec1")).resolves.toEqual({
      export_spec_id: "spec1",
      row_length: 42
    });

    await expect(loadExportFields(pool, "spec1")).resolves.toEqual([
      {
        export_field_id: "f1",
        field_name: "FORM_TYPE",
        start_pos: 1,
        end_pos: 3,
        field_length: 3,
        domain_type: null
      },
      {
        export_field_id: "f2",
        field_name: "DODID",
        start_pos: 4,
        end_pos: 13,
        field_length: 10,
        domain_type: "DODID10"
      }
    ]);

    expect(calls[0]!.text).toContain("FROM dbo.EXPORT_SPEC");
    expect(calls[0]!.inputs).toEqual([{ name: "sid", value: "spec1" }]);
    expect(calls[1]!.text).toContain("FROM dbo.EXPORT_FIELD");
    expect(calls[1]!.text).toContain("LEFT JOIN dbo.VALUE_DOMAIN");
    expect(calls[1]!.text).toContain("ORDER BY ef.field_order");
    expect(calls[1]!.inputs).toEqual([{ name: "sid", value: "spec1" }]);
  });

  test("loads raw mapping rules without parsing transforms", async () => {
    const { pool, calls } = fakePool([
      [
        {
          export_field_id: "f1",
          source_expression: "RESP:DEM:EMAIL",
          transform_pipeline: "trim|lower",
          default_value: null,
          pad_rule: "pad:right:space"
        }
      ]
    ]);

    await expect(loadRawMappingRules(pool, "mapping1")).resolves.toEqual([
      {
        export_field_id: "f1",
        source_expression: "RESP:DEM:EMAIL",
        transform_pipeline: "trim|lower",
        default_value: null,
        pad_rule: "pad:right:space"
      }
    ]);

    expect(calls[0]!.text).toContain("FROM dbo.MAPPING_RULE");
    expect(calls[0]!.inputs).toEqual([{ name: "mid", value: "mapping1" }]);
  });

  test("loads run summary and validation error counts", async () => {
    const startedAt = new Date("2026-02-14T00:00:00.000Z");
    const { pool, calls } = fakePool([
      [
        {
          run_id: "run1",
          run_name: "spec_ts",
          seed: "123",
          target_record_count: "5",
          started_at: startedAt,
          finished_at: null,
          status: "running"
        }
      ],
      [
        { error_code: "BAD_DATE", cnt: "2" },
        { error_code: "LEN_MISMATCH", cnt: 1 }
      ]
    ]);

    await expect(loadRunSummary(pool, "run1")).resolves.toEqual({
      run_id: "run1",
      run_name: "spec_ts",
      seed: 123,
      target_record_count: 5,
      started_at: startedAt,
      finished_at: null,
      status: "running"
    });

    await expect(loadValidationErrorCounts(pool, "file1")).resolves.toEqual([
      { error_code: "BAD_DATE", cnt: 2 },
      { error_code: "LEN_MISMATCH", cnt: 1 }
    ]);

    expect(calls[0]!.text).toContain("FROM dbo.[RUN]");
    expect(calls[0]!.inputs).toEqual([{ name: "id", value: "run1" }]);
    expect(calls[1]!.text).toContain("FROM dbo.VALIDATION_ERROR");
    expect(calls[1]!.text).toContain("GROUP BY error_code");
    expect(calls[1]!.text).toContain("ORDER BY cnt DESC");
    expect(calls[1]!.inputs).toEqual([{ name: "id", value: "file1" }]);
  });

  test("loads assessment ids for a run with deterministic ordering", async () => {
    const { pool, calls } = fakePool([[{ assessment_id: "a2" }, { assessment_id: "a1" }], []]);

    await expect(loadAssessmentIdsForRun(pool, "run1")).resolves.toEqual(["a2", "a1"]);
    await updateRunStatus(pool, "run1", "finished");

    expect(calls[0]!.text).toContain("FROM dbo.ASSESSMENT");
    expect(calls[0]!.text).toContain("WHERE run_id = @id");
    expect(calls[0]!.text).toContain("ORDER BY assessment_id");
    expect(calls[0]!.inputs).toEqual([{ name: "id", value: "run1" }]);
    expect(calls[1]!.text).toContain("UPDATE dbo.[RUN]");
    expect(calls[1]!.text).toContain("finished_at = SYSUTCDATETIME()");
    expect(calls[1]!.inputs).toEqual([
      { name: "st", value: "finished" },
      { name: "id", value: "run1" }
    ]);
  });

  test("creates export file rows and persists validation errors", async () => {
    const { pool, calls } = fakePool([[], []]);

    const exportFileId = await createExportFile(pool, {
      runId: "run1",
      mappingSetId: "mapping1",
      filePath: "./out/app2.txt",
      recordCount: 2
    });
    await persistValidationErrors(pool, exportFileId, [
      {
        record_ordinal: 1,
        export_field_name: "DATE",
        error_code: "BAD_DATE",
        expected: "YYYYMMDD",
        actual: "2026AB14",
        message: "Date must be YYYYMMDD"
      }
    ]);

    expect(exportFileId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0]!.text).toContain("INSERT INTO dbo.EXPORT_FILE");
    expect(calls[0]!.inputs).toEqual([
      { name: "id", value: exportFileId },
      { name: "rid", value: "run1" },
      { name: "mid", value: "mapping1" },
      { name: "p", value: "./out/app2.txt" },
      { name: "cnt", value: 2 }
    ]);
    expect(calls[1]!.text).toContain("INSERT INTO dbo.VALIDATION_ERROR");
    expect(calls[1]!.inputs).toEqual([
      { name: "id", value: expect.any(String) },
      { name: "fid", value: exportFileId },
      { name: "ord", value: 1 },
      { name: "name", value: "DATE" },
      { name: "code", value: "BAD_DATE" },
      { name: "exp", value: "YYYYMMDD" },
      { name: "act", value: "2026AB14" },
      { name: "msg", value: "Date must be YYYYMMDD" }
    ]);
  });
});
