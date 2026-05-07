import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";

import type { Application3OutputLayout } from "../../Application/03/src/output_layout.js";
import {
  APPLICATION3_ROW_FIELD_NAME,
  APPLICATION3_ROW_LENGTH_ERROR_CODE,
  validateApplication2OutputFile
} from "../../Application/03/src/validator_workflow.js";

const layout: Application3OutputLayout = {
  row_length: 18,
  fields: [
    {
      field_name: "DODID",
      start_pos: 1,
      length: 10,
      domain_type: "DODID10"
    },
    {
      field_name: "DATE",
      start_pos: 11,
      length: 8,
      domain_type: "DATE_YYYYMMDD"
    }
  ]
};

async function writeOutputFile(path: string, lines: string[]): Promise<void> {
  await fs.writeFile(path, lines.map((line) => `${line}\n`).join(""), "utf8");
}

test.describe("Application 3 validator workflow", () => {
  test("validates a fixed-width output file with no errors", async ({}, testInfo) => {
    const inputPath = testInfo.outputPath("valid.txt");
    await writeOutputFile(inputPath, ["123456789020260214", "          20261231"]);

    await expect(
      validateApplication2OutputFile({
        inputPath,
        layout,
        layoutSource: "layout.json"
      })
    ).resolves.toEqual({
      input_path: inputPath,
      layout_source: "layout.json",
      records_checked: 2,
      validation_error_count: 0,
      validation_errors: [],
      error_counts: []
    });
  });

  test("reports field domain failures in record and layout order", async ({}, testInfo) => {
    const inputPath = testInfo.outputPath("bad_domain.txt");
    await writeOutputFile(inputPath, ["ABCDEF12342026AB14"]);

    await expect(validateApplication2OutputFile({ inputPath, layout })).resolves.toEqual({
      input_path: inputPath,
      layout_source: null,
      records_checked: 1,
      validation_error_count: 2,
      validation_errors: [
        {
          record_ordinal: 1,
          export_field_name: "DODID",
          error_code: "BAD_DODID10",
          expected: "10 digits",
          actual: "ABCDEF1234",
          message: "DoD ID must be 10 digits"
        },
        {
          record_ordinal: 1,
          export_field_name: "DATE",
          error_code: "BAD_DATE",
          expected: "YYYYMMDD",
          actual: "2026AB14",
          message: "Date must be YYYYMMDD"
        }
      ],
      error_counts: [
        { error_code: "BAD_DATE", count: 1 },
        { error_code: "BAD_DODID10", count: 1 }
      ]
    });
  });

  test("reports row length and sliced field length failures", async ({}, testInfo) => {
    const inputPath = testInfo.outputPath("short_row.txt");
    await writeOutputFile(inputPath, ["12345678902026"]);

    await expect(validateApplication2OutputFile({ inputPath, layout })).resolves.toEqual({
      input_path: inputPath,
      layout_source: null,
      records_checked: 1,
      validation_error_count: 2,
      validation_errors: [
        {
          record_ordinal: 1,
          export_field_name: APPLICATION3_ROW_FIELD_NAME,
          error_code: APPLICATION3_ROW_LENGTH_ERROR_CODE,
          expected: "18",
          actual: "14",
          message: "Expected row length 18, got 14"
        },
        {
          record_ordinal: 1,
          export_field_name: "DATE",
          error_code: "LEN_MISMATCH",
          expected: "8",
          actual: "4",
          message: "Expected padded value length 8, got 4"
        }
      ],
      error_counts: [
        { error_code: "LEN_MISMATCH", count: 1 },
        { error_code: APPLICATION3_ROW_LENGTH_ERROR_CODE, count: 1 }
      ]
    });
  });

  test("reports row length failures when extra data is present", async ({}, testInfo) => {
    const inputPath = testInfo.outputPath("long_row.txt");
    await writeOutputFile(inputPath, ["123456789020260214X"]);

    await expect(validateApplication2OutputFile({ inputPath, layout })).resolves.toMatchObject({
      records_checked: 1,
      validation_error_count: 1,
      validation_errors: [
        {
          record_ordinal: 1,
          export_field_name: APPLICATION3_ROW_FIELD_NAME,
          error_code: APPLICATION3_ROW_LENGTH_ERROR_CODE,
          expected: "18",
          actual: "19",
          message: "Expected row length 18, got 19"
        }
      ],
      error_counts: [{ error_code: APPLICATION3_ROW_LENGTH_ERROR_CODE, count: 1 }]
    });
  });

  test("returns zero records and zero errors for an empty file", async ({}, testInfo) => {
    const inputPath = testInfo.outputPath("empty.txt");
    await fs.writeFile(inputPath, "", "utf8");

    await expect(validateApplication2OutputFile({ inputPath, layout })).resolves.toEqual({
      input_path: inputPath,
      layout_source: null,
      records_checked: 0,
      validation_error_count: 0,
      validation_errors: [],
      error_counts: []
    });
  });
});
