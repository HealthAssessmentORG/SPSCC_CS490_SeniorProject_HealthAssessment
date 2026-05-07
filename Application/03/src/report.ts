import type {
  Application3ValidationErrorCount,
  Application3ValidationWorkflowResult
} from "./validator_workflow.js";
import type { Application3ValidationErrorRow } from "./validation.js";

export const APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT = 5;

export type Application3ValidationResultText = "passed" | "failed";

export type Application3JsonReport = {
  ok: boolean;
  input_path: string;
  layout_source: string | null;
  records_checked: number;
  validation_error_count: number;
  validation_result: Application3ValidationResultText;
  error_counts: Application3ValidationErrorCount[];
  error_sample_limit: number;
  error_sample_truncated: boolean;
  error_sample: Application3ValidationErrorRow[];
};

function validationResult(result: Application3ValidationWorkflowResult): Application3ValidationResultText {
  return result.validation_error_count === 0 ? "passed" : "failed";
}

function sortedErrorCounts(rows: Application3ValidationErrorCount[]): Application3ValidationErrorCount[] {
  return [...rows].sort((left, right) =>
    left.error_code === right.error_code ? left.count - right.count : left.error_code.localeCompare(right.error_code)
  );
}

function sampleLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 0) return APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT;
  return limit;
}

function sampleErrors(
  result: Application3ValidationWorkflowResult,
  limit = APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT
): Application3ValidationErrorRow[] {
  return result.validation_errors.slice(0, sampleLimit(limit));
}

function formatNullable(value: string | null): string {
  return value ?? "(none)";
}

export function renderApplication3JsonReport(
  result: Application3ValidationWorkflowResult,
  limit = APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT
): Application3JsonReport {
  const resolvedLimit = sampleLimit(limit);
  const errorSample = sampleErrors(result, resolvedLimit);

  return {
    ok: result.validation_error_count === 0,
    input_path: result.input_path,
    layout_source: result.layout_source,
    records_checked: result.records_checked,
    validation_error_count: result.validation_error_count,
    validation_result: validationResult(result),
    error_counts: sortedErrorCounts(result.error_counts),
    error_sample_limit: resolvedLimit,
    error_sample_truncated: result.validation_errors.length > errorSample.length,
    error_sample: errorSample
  };
}

export function renderApplication3HumanReport(
  result: Application3ValidationWorkflowResult,
  limit = APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT
): string {
  const resolvedLimit = sampleLimit(limit);
  const errorSample = sampleErrors(result, resolvedLimit);
  const lines = [
    "Application 3 validation report",
    `Input path: ${result.input_path}`,
    `Layout: ${result.layout_source ?? "(provided)"}`,
    `Records checked: ${result.records_checked}`,
    `Validation errors: ${result.validation_error_count}`,
    `Validation result: ${validationResult(result)}`
  ];

  if (result.error_counts.length === 0) {
    lines.push("Error counts: none");
  } else {
    lines.push("Error counts:");
    for (const row of sortedErrorCounts(result.error_counts)) {
      lines.push(`- ${row.error_code}: ${row.count}`);
    }
  }

  if (errorSample.length === 0) {
    lines.push("Error sample: none");
  } else {
    lines.push(`Error sample (first ${resolvedLimit}):`);
    for (const error of errorSample) {
      lines.push(
        `- record ${error.record_ordinal} ${error.export_field_name} ${error.error_code}: expected ${formatNullable(
          error.expected
        )}, actual ${formatNullable(error.actual)}; ${error.message}`
      );
    }
    if (result.validation_errors.length > errorSample.length) {
      lines.push(`Error sample truncated: ${result.validation_errors.length - errorSample.length} more errors`);
    }
  }

  return lines.join("\n") + "\n";
}
