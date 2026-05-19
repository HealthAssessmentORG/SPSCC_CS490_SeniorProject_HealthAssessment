import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
  APPLICATION3_UI_DEFAULT_REPORT_PATH,
  resolveApplication3UiReportPath,
  writeApplication3UiHumanReport
} from "../../Application/03/src/ui_report_action.js";
import { renderApplication3HumanReport } from "../../Application/03/src/report.js";
import type { Application3ValidationWorkflowResult } from "../../Application/03/src/validator_workflow.js";

const result: Application3ValidationWorkflowResult = {
  input_path: "out.txt",
  layout_source: "layout.json",
  records_checked: 1,
  validation_error_count: 1,
  validation_errors: [
    {
      record_ordinal: 1,
      export_field_name: "DODID",
      error_code: "BAD_DODID10",
      expected: "10 digits",
      actual: "ABCDEF1234",
      message: "DoD ID must be 10 digits"
    }
  ],
  error_counts: [{ error_code: "BAD_DODID10", count: 1 }]
};

test.describe("Application 3 UI report action", () => {
  test("uses the default UI report path when APP3_REPORT_PATH is unset or blank", () => {
    expect(resolveApplication3UiReportPath({})).toBe(APPLICATION3_UI_DEFAULT_REPORT_PATH);
    expect(resolveApplication3UiReportPath({ APP3_REPORT_PATH: "   " })).toBe(APPLICATION3_UI_DEFAULT_REPORT_PATH);
  });

  test("uses a trimmed APP3_REPORT_PATH when set", () => {
    expect(resolveApplication3UiReportPath({ APP3_REPORT_PATH: "  out/custom-report.txt  " })).toBe(
      "out/custom-report.txt"
    );
  });

  test("creates parent directories and writes the human report content", async ({}, testInfo) => {
    const reportPath = testInfo.outputPath("nested", "app3_report.txt");

    await expect(writeApplication3UiHumanReport(result, reportPath)).resolves.toEqual({
      ok: true,
      path: reportPath
    });
    await expect(fs.readFile(reportPath, "utf8")).resolves.toBe(renderApplication3HumanReport(result));
  });

  test("returns a concise failure when the report path cannot be written", async ({}, testInfo) => {
    const directoryPath = testInfo.outputPath("report-directory");
    await fs.mkdir(directoryPath, { recursive: true });

    await expect(writeApplication3UiHumanReport(result, directoryPath)).resolves.toEqual({
      ok: false,
      message: "Report write failed"
    });
  });

  test("writes to a filename in the current directory", async ({}, testInfo) => {
    const reportPath = join(testInfo.outputDir, "flat-report.txt");

    await expect(writeApplication3UiHumanReport(result, reportPath)).resolves.toEqual({
      ok: true,
      path: reportPath
    });
  });
});
