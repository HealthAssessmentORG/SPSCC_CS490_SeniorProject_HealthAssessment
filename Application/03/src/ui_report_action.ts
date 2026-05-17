import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT,
  renderApplication3HumanReport
} from "./report.js";
import type { Application3ValidationWorkflowResult } from "./validator_workflow.js";

export const APPLICATION3_UI_REPORT_PATH_ENV = "APP3_REPORT_PATH";
export const APPLICATION3_UI_DEFAULT_REPORT_PATH = "out/milestones/demo/app3_ui_report.txt";

export type Application3UiReportWriteResult =
  | { ok: true; path: string }
  | { ok: false; message: "Report write failed" };

export function resolveApplication3UiReportPath(env: NodeJS.ProcessEnv = process.env): string {
  const value = env[APPLICATION3_UI_REPORT_PATH_ENV];
  if (!value || value.trim().length === 0) return APPLICATION3_UI_DEFAULT_REPORT_PATH;
  return value.trim();
}

export async function writeApplication3UiHumanReport(
  result: Application3ValidationWorkflowResult,
  reportPath = resolveApplication3UiReportPath()
): Promise<Application3UiReportWriteResult> {
  try {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, renderApplication3HumanReport(result, APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT), "utf8");
    return { ok: true, path: reportPath };
  } catch {
    return { ok: false, message: "Report write failed" };
  }
}
