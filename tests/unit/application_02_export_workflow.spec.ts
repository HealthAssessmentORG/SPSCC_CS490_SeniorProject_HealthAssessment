import { test, expect } from "@playwright/test";
import fs from "node:fs";

import type { DbPool } from "../../Application/02/src/db/db_connect.js";
import { runApplication2ExportWorkflow } from "../../Application/02/src/workflow/export_workflow.js";

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

test.describe("Application 2 export workflow", () => {
  test("pulls existing rows, writes fixed-width output, and finalizes the run", async ({}, testInfo) => {
    const outPath = testInfo.outputPath("app2_export.txt");
    const { pool, calls } = fakePool([
      [{ assessment_id: "a1" }, { assessment_id: "a2" }],
      [{ export_spec_id: "spec1", row_length: 9 }],
      [
        {
          export_field_id: "f_form",
          field_name: "FORM_TYPE",
          start_pos: 1,
          end_pos: 3,
          field_length: 3,
          domain_type: null
        },
        {
          export_field_id: "f_email",
          field_name: "EMAIL",
          start_pos: 5,
          end_pos: 9,
          field_length: 5,
          domain_type: null
        }
      ],
      [
        {
          export_field_id: "f_form",
          source_expression: "CONST",
          transform_pipeline: "trim",
          default_value: "CAM",
          pad_rule: "pad:right:space"
        },
        {
          export_field_id: "f_email",
          source_expression: "RESP_FIELD:EMAIL",
          transform_pipeline: "trim|lower",
          default_value: null,
          pad_rule: "pad:right:space"
        }
      ],
      [],
      [{ assessment_id: "a1" }],
      [{ deployer_id: "d1" }],
      [{ assessment_id: "a1" }],
      [{ question_code: "DEM", field_name: "EMAIL", value_norm: " XY " }],
      [{ assessment_id: "a2" }],
      [{ deployer_id: "d2" }],
      [{ assessment_id: "a2" }],
      [{ question_code: "DEM", field_name: "EMAIL", value_norm: " AB " }],
      []
    ]);

    const progressEvents: Array<{ type: string; current: number; total: number }> = [];

    const result = await runApplication2ExportWorkflow(
      pool,
      {
        runId: "run1",
        exportSpecId: "spec1",
        mappingSetId: "mapping1",
        out: outPath,
        json: false
      },
      {
        onRecordWritten: async (event) => {
          progressEvents.push(event);
        }
      }
    );

    expect(result).toMatchObject({
      ok: true,
      run_id: "run1",
      record_count: 2,
      out_path: outPath,
      validation_error_count: 0
    });
    expect(result.export_file_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(fs.promises.readFile(outPath, "utf8")).resolves.toBe("CAM xy   \nCAM ab   \n");
    expect(progressEvents).toEqual([
      { type: "record_progress", current: 1, total: 2 },
      { type: "record_progress", current: 2, total: 2 }
    ]);

    expect(calls).toHaveLength(14);
    expect(calls[0]!.text).toContain("FROM dbo.ASSESSMENT");
    expect(calls[0]!.text).toContain("ORDER BY assessment_id");
    expect(calls[1]!.text).toContain("FROM dbo.EXPORT_SPEC");
    expect(calls[2]!.text).toContain("FROM dbo.EXPORT_FIELD");
    expect(calls[3]!.text).toContain("FROM dbo.MAPPING_RULE");
    expect(calls[4]!.text).toContain("INSERT INTO dbo.EXPORT_FILE");
    for (const call of calls.slice(5, 9)) {
      expect(call.inputs).toEqual([{ name: "id", value: "a1" }]);
    }
    for (const call of calls.slice(9, 13)) {
      expect(call.inputs).toEqual([{ name: "id", value: "a2" }]);
    }
    expect(calls.some((call) => /INSERT INTO dbo\.EXPORT_FILE/.test(call.text))).toBeTruthy();
    expect(calls.some((call) => /INSERT INTO dbo\.VALIDATION_ERROR/.test(call.text))).toBeFalsy();
    const updateRun = calls.find((call) => /UPDATE dbo\.\[RUN\]/.test(call.text));
    expect(updateRun?.inputs).toEqual([
      { name: "st", value: "finished" },
      { name: "id", value: "run1" }
    ]);
  });

  test("preserves one-based record ordinals and marks the run finished_with_errors", async ({}, testInfo) => {
    const outPath = testInfo.outputPath("app2_export_with_errors.txt");
    const { pool, calls } = fakePool([
      [{ assessment_id: "a1" }],
      [{ export_spec_id: "spec1", row_length: 8 }],
      [
        {
          export_field_id: "f_date",
          field_name: "DATE",
          start_pos: 1,
          end_pos: 8,
          field_length: 8,
          domain_type: "DATE_YYYYMMDD"
        }
      ],
      [
        {
          export_field_id: "f_date",
          source_expression: "RESP:DEM:DATE",
          transform_pipeline: "trim",
          default_value: null,
          pad_rule: "pad:right:space"
        }
      ],
      [],
      [{ assessment_id: "a1" }],
      [],
      [],
      [{ question_code: "DEM", field_name: "DATE", value_norm: "2026AB14" }],
      [],
      []
    ]);

    const progressEvents: Array<{ type: string; current: number; total: number }> = [];

    const result = await runApplication2ExportWorkflow(
      pool,
      {
        runId: "run1",
        exportSpecId: "spec1",
        mappingSetId: "mapping1",
        out: outPath,
        json: true
      },
      {
        onRecordWritten: async (event) => {
          progressEvents.push(event);
        }
      }
    );

    expect(result).toMatchObject({
      ok: true,
      run_id: "run1",
      record_count: 1,
      out_path: outPath,
      validation_error_count: 1
    });
    await expect(fs.promises.readFile(outPath, "utf8")).resolves.toBe("2026AB14\n");
    expect(progressEvents).toEqual([{ type: "record_progress", current: 1, total: 1 }]);

    const validationInsert = calls.find((call) => /INSERT INTO dbo\.VALIDATION_ERROR/.test(call.text));
    expect(validationInsert?.inputs).toEqual([
      { name: "id", value: expect.any(String) },
      { name: "fid", value: result.export_file_id },
      { name: "ord", value: 1 },
      { name: "name", value: "DATE" },
      { name: "code", value: "BAD_DATE" },
      { name: "exp", value: "YYYYMMDD" },
      { name: "act", value: "2026AB14" },
      { name: "msg", value: "Date must be YYYYMMDD" }
    ]);

    const updateRun = calls.find((call) => /UPDATE dbo\.\[RUN\]/.test(call.text));
    expect(updateRun?.inputs).toEqual([
      { name: "st", value: "finished_with_errors" },
      { name: "id", value: "run1" }
    ]);
  });
});
