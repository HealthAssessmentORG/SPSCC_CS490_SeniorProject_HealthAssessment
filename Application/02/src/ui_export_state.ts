import { safeApplication2DbConfigError } from "./api/db_error.js";
import type {
  Application2DatabaseFormSummary,
  Application2DatabaseSummary,
  Application2ExportResult
} from "./types.js";
import type { Application2DashboardData } from "./ui_demo_data.js";

export const APP2_UI_EXPORT_FORM_METADATA_UNAVAILABLE =
  "Export unavailable: export form metadata is unavailable. Confirm EXPORT_SPEC, EXPORT_FIELD, and MAPPING_SET.";

export const APP2_UI_EXPORT_RUNNING_NOTICE = "Export running; wait for completion.";

export type Application2UiExportPhase = "idle" | "running" | "complete" | "failed";

export type Application2UiExportPlan = {
  runId: string;
  exportSpecId: string;
  mappingSetId: string;
  out: string;
  formName: string;
};

export type Application2UiExportReadiness =
  | { ready: true; plan: Application2UiExportPlan }
  | { ready: false; reason: string };

export type Application2UiExportProgressView = {
  recordText: string;
  percentText: string;
};

export type Application2UiExportCompleteView = {
  outPath: string;
  recordCount: number;
  exportFileId: string;
  validationErrorCount: number;
};

function latestRunId(summary: Application2DatabaseSummary): string | null {
  const runId = summary.latest_run?.run_id;
  const trimmed = runId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function buildApplication2UiExportOutPath(runId: string): string {
  return `out/application_02_ui_export_${runId}.txt`;
}

export function buildApplication2UiExportReadiness(
  data: Application2DashboardData,
  formSummary: Application2DatabaseFormSummary | null,
  formSummaryAvailable: boolean
): Application2UiExportReadiness {
  if (data.dataSource === "saved demo data") {
    return {
      ready: false,
      reason: "Export unavailable: saved demo data is not a live database."
    };
  }

  if (!formSummaryAvailable || !formSummary) {
    return {
      ready: false,
      reason: APP2_UI_EXPORT_FORM_METADATA_UNAVAILABLE
    };
  }

  const runId = latestRunId(data.summary);
  if (!runId) {
    return {
      ready: false,
      reason: "Export unavailable: no latest run is available."
    };
  }

  const form = formSummary.forms[0];
  const exportSpecId = form?.uuids.export_spec_id.trim();
  if (!form || !exportSpecId) {
    return {
      ready: false,
      reason: "Export unavailable: no export form is available."
    };
  }

  const mappingSetId = form.uuids.mapping_set_ids.find((value) => value.trim().length > 0)?.trim();
  if (!mappingSetId) {
    return {
      ready: false,
      reason: "Export unavailable: no mapping set is available for the selected form."
    };
  }

  return {
    ready: true,
    plan: {
      runId,
      exportSpecId,
      mappingSetId,
      out: buildApplication2UiExportOutPath(runId),
      formName: form.form_name
    }
  };
}

export function formatApplication2UiExportProgress(
  current: number,
  total: number
): Application2UiExportProgressView {
  const boundedCurrent = Math.max(0, current);
  const boundedTotal = Math.max(0, total);

  if (boundedTotal === 0) {
    return {
      recordText: `${boundedCurrent}/${boundedTotal}`,
      percentText: "n/a"
    };
  }

  const percent = Math.min(100, Math.floor((boundedCurrent / boundedTotal) * 100));
  return {
    recordText: `${boundedCurrent}/${boundedTotal}`,
    percentText: `${percent}%`
  };
}

export function buildApplication2UiExportCompleteView(
  result: Application2ExportResult
): Application2UiExportCompleteView {
  return {
    outPath: result.out_path,
    recordCount: result.record_count,
    exportFileId: result.export_file_id,
    validationErrorCount: result.validation_error_count
  };
}

export function getApplication2UiExportBlockedNotice(
  phase: Application2UiExportPhase
): string | null {
  return phase === "running" ? APP2_UI_EXPORT_RUNNING_NOTICE : null;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? "";
}

function mayExposeSensitiveDetail(message: string): boolean {
  return /(password|pwd=|connection string|data source=|server=tcp:|stack trace|\s+at\s+\S+\s*\()/i.test(
    message
  );
}

export function sanitizeApplication2UiExportError(error: unknown): string {
  const safeDbError = safeApplication2DbConfigError(error);
  if (safeDbError) return safeDbError;

  const raw = error instanceof Error ? error.message : String(error);
  if (mayExposeSensitiveDetail(raw)) {
    return "Application 2 export failed.";
  }

  const message = firstLine(raw).trim();
  if (!message) {
    return "Application 2 export failed.";
  }

  if (message.length <= 180) return message;
  return `${message.slice(0, 177)}...`;
}
