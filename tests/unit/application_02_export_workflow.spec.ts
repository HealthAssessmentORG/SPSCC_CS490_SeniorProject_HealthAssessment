import { test, expect } from "@playwright/test";
import fs from "node:fs";

import type { DbPool } from "../../Application/02/src/db/db_connect";
import { runApplication2ExportWorkflow } from "../../Application/02/src/workflow/export_workflow";

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
          source_expression: "RESP:DEM:EMAIL",
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

    const result = await runApplication2ExportWorkflow(pool, {
      runId: "run1",
      exportSpecId: "spec1",
      mappingSetId: "mapping1",
      out: outPath,
      json: false
    });

    expect(result).toMatchObject({
      ok: true,
      run_id: "run1",
      record_count: 2,
      out_path: outPath,
      validation_error_count: 0
    });
    expect(result.export_file_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(fs.promises.readFile(outPath, "utf8")).resolves.toBe("CAM xy   \nCAM ab   \n");

    expect(calls.some((call) => /INSERT INTO dbo\.EXPORT_FILE/.test(call.text))).toBeTruthy();
    expect(calls.some((call) => /INSERT INTO dbo\.VALIDATION_ERROR/.test(call.text))).toBeFalsy();
    const updateRun = calls.find((call) => /UPDATE dbo\.\[RUN\]/.test(call.text));
    expect(updateRun?.inputs).toEqual([
      { name: "st", value: "finished" },
      { name: "id", value: "run1" }
    ]);
  });
});
