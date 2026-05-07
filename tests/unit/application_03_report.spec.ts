import { test, expect } from "@playwright/test";

import {
  APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT,
  renderApplication3HumanReport,
  renderApplication3JsonReport
} from "../../Application/03/src/report.js";
import type { Application3ValidationWorkflowResult } from "../../Application/03/src/validator_workflow.js";

function resultWithErrors(count: number): Application3ValidationWorkflowResult {
  const validation_errors = Array.from({ length: count }, (_, index) => ({
    record_ordinal: index + 1,
    export_field_name: index % 2 === 0 ? "DODID" : "DATE",
    error_code: index % 2 === 0 ? "BAD_DODID10" : "BAD_DATE",
    expected: index % 2 === 0 ? "10 digits" : "YYYYMMDD",
    actual: `bad-${index + 1}`,
    message: index % 2 === 0 ? "DoD ID must be 10 digits" : "Date must be YYYYMMDD"
  }));

  return {
    input_path: "out.txt",
    layout_source: "layout.json",
    records_checked: count,
    validation_error_count: count,
    validation_errors,
    error_counts: [
      { error_code: "BAD_DODID10", count: Math.ceil(count / 2) },
      { error_code: "BAD_DATE", count: Math.floor(count / 2) }
    ]
  };
}

test.describe("Application 3 report rendering", () => {
  test("renders a deterministic passing human report", () => {
    const result: Application3ValidationWorkflowResult = {
      input_path: "out.txt",
      layout_source: "layout.json",
      records_checked: 1,
      validation_error_count: 0,
      validation_errors: [],
      error_counts: []
    };

    expect(renderApplication3HumanReport(result)).toBe(
      [
        "Application 3 validation report",
        "Input path: out.txt",
        "Layout: layout.json",
        "Records checked: 1",
        "Validation errors: 0",
        "Validation result: passed",
        "Error counts: none",
        "Error sample: none",
        ""
      ].join("\n")
    );
  });

  test("renders sorted counts and a bounded human error sample", () => {
    const result = resultWithErrors(APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT + 1);

    const report = renderApplication3HumanReport(result);

    expect(report).toContain("Validation result: failed");
    expect(report).toContain("- BAD_DATE: 3");
    expect(report).toContain("- BAD_DODID10: 3");
    expect(report).toContain(`Error sample (first ${APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT}):`);
    expect(report).toContain("Error sample truncated: 1 more errors");
    expect(report).toContain("- record 1 DODID BAD_DODID10: expected 10 digits, actual bad-1; DoD ID must be 10 digits");
    expect(report).not.toContain("bad-6");
  });

  test("renders deterministic bounded JSON report data", () => {
    const result = resultWithErrors(APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT + 1);

    expect(renderApplication3JsonReport(result)).toEqual({
      ok: false,
      input_path: "out.txt",
      layout_source: "layout.json",
      records_checked: 6,
      validation_error_count: 6,
      validation_result: "failed",
      error_counts: [
        { error_code: "BAD_DATE", count: 3 },
        { error_code: "BAD_DODID10", count: 3 }
      ],
      error_sample_limit: APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT,
      error_sample_truncated: true,
      error_sample: result.validation_errors.slice(0, APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT)
    });
  });
});
