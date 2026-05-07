import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import type { Application3OutputLayout } from "./output_layout.js";
import { validateRecord, type Application3ValidationErrorRow } from "./validation.js";

export const APPLICATION3_ROW_FIELD_NAME = "__ROW__";
export const APPLICATION3_ROW_LENGTH_ERROR_CODE = "ROW_LENGTH_MISMATCH";

export type Application3ValidationErrorCount = {
  error_code: string;
  count: number;
};

export type Application3ValidateOutputFileOptions = {
  inputPath: string;
  layout: Application3OutputLayout;
  layoutSource?: string;
};

export type Application3ValidationWorkflowResult = {
  input_path: string;
  layout_source: string | null;
  records_checked: number;
  validation_error_count: number;
  validation_errors: Application3ValidationErrorRow[];
  error_counts: Application3ValidationErrorCount[];
};

function sliceFieldValues(line: string, layout: Application3OutputLayout): Map<string, string> {
  const values = new Map<string, string>();

  for (const field of layout.fields) {
    const startIndex = field.start_pos - 1;
    values.set(field.field_name, line.slice(startIndex, startIndex + field.length));
  }

  return values;
}

function buildRowLengthError(
  recordOrdinal: number,
  expectedLength: number,
  actualLength: number
): Application3ValidationErrorRow {
  return {
    record_ordinal: recordOrdinal,
    export_field_name: APPLICATION3_ROW_FIELD_NAME,
    error_code: APPLICATION3_ROW_LENGTH_ERROR_CODE,
    expected: String(expectedLength),
    actual: String(actualLength),
    message: `Expected row length ${expectedLength}, got ${actualLength}`
  };
}

function buildErrorCounts(errors: Application3ValidationErrorRow[]): Application3ValidationErrorCount[] {
  const counts = new Map<string, number>();

  for (const error of errors) {
    counts.set(error.error_code, (counts.get(error.error_code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([error_code, count]) => ({ error_code, count }));
}

export async function validateApplication2OutputFile(
  options: Application3ValidateOutputFileOptions
): Promise<Application3ValidationWorkflowResult> {
  const validationErrors: Application3ValidationErrorRow[] = [];
  let recordsChecked = 0;

  const lines = createInterface({
    input: createReadStream(options.inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  try {
    for await (const line of lines) {
      recordsChecked += 1;

      if (line.length !== options.layout.row_length) {
        validationErrors.push(buildRowLengthError(recordsChecked, options.layout.row_length, line.length));
      }

      validationErrors.push(...validateRecord(recordsChecked, options.layout.fields, sliceFieldValues(line, options.layout)));
    }
  } finally {
    lines.close();
  }

  return {
    input_path: options.inputPath,
    layout_source: options.layoutSource ?? null,
    records_checked: recordsChecked,
    validation_error_count: validationErrors.length,
    validation_errors: validationErrors,
    error_counts: buildErrorCounts(validationErrors)
  };
}
