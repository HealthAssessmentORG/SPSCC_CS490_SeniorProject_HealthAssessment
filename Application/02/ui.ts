import React from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

import { closeApplication2Pool, getApplication2Pool } from "./src/db_connect.js";
import { getApplication2DatabaseStatus } from "./src/api/database_status.js";
import { getApplication2DatabaseSummary } from "./src/api/database_summary.js";
import { loadDatabaseFormSummary } from "./src/repositories/database_form_summary_repository.js";
import { runApplication2ExportWorkflow } from "./src/workflow/export_workflow.js";
import type { Application2DatabaseFormSummary } from "./src/types.js";
import {
  loadApplication2UiDemoData,
  readApplication2UiDemoDataPath,
  type Application2DashboardData,
  type Application2UiDataSource
} from "./src/ui_demo_data.js";
import {
  buildApplication2UiExportCompleteView,
  buildApplication2UiExportReadiness,
  formatApplication2UiExportProgress,
  getApplication2UiExportBlockedNotice,
  sanitizeApplication2UiExportError,
  type Application2UiExportCompleteView,
  type Application2UiExportPlan
} from "./src/ui_export_state.js";

type DashboardContent = Application2DashboardData & {
  formSummary: Application2DatabaseFormSummary | null;
  formSummaryAvailable: boolean;
};

type ExportStatus =
  | { phase: "idle" }
  | { phase: "running"; plan: Application2UiExportPlan; current: number; total: number }
  | { phase: "complete"; plan: Application2UiExportPlan; result: Application2UiExportCompleteView }
  | { phase: "failed"; plan: Application2UiExportPlan; error: string };

type DashboardState = {
  data: DashboardContent | null;
  error: string | null;
  exportStatus: ExportStatus;
  loading: boolean;
  notice: string | null;
  spinnerIndex: number;
};

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "n/a";
  return String(value);
}

function formatTimestamp(value: string | null): string {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function selectedDataSource(): Application2UiDataSource {
  return readApplication2UiDemoDataPath() ? "saved demo data" : "live database";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (readApplication2UiDemoDataPath()) return message;
  return `${message}\nDemo fallback: set APP2_UI_DEMO_DATA_PATH to a saved demo data JSON file.`;
}

async function loadDashboardData(): Promise<DashboardContent> {
  const demoDataPath = readApplication2UiDemoDataPath();
  if (demoDataPath) {
    return {
      ...(await loadApplication2UiDemoData(demoDataPath)),
      formSummary: null,
      formSummaryAvailable: false
    };
  }

  const [statusRes, summaryRes] = await Promise.all([
    getApplication2DatabaseStatus(),
    getApplication2DatabaseSummary()
  ]);

  if (statusRes.statusCode !== 200 || !("ok" in statusRes.body && statusRes.body.ok === true)) {
    const err = (statusRes.body as any)?.error ?? "Database status check failed";
    throw new Error(err);
  }

  if (summaryRes.statusCode !== 200 || !("ok" in summaryRes.body && summaryRes.body.ok === true)) {
    const err = (summaryRes.body as any)?.error ?? "Database summary check failed";
    throw new Error(err);
  }

  const status = {
    database: (statusRes.body as any).database,
    tables: (statusRes.body as any).tables
  };

  const summary = {
    database: (summaryRes.body as any).database,
    counts: (summaryRes.body as any).counts,
    latest_run: (summaryRes.body as any).latest_run,
    latest_export_file: (summaryRes.body as any).latest_export_file
  };

  let formSummary: Application2DatabaseFormSummary | null = null;
  let formSummaryAvailable = false;
  try {
    formSummary = await loadDatabaseFormSummary(await getApplication2Pool());
    formSummaryAvailable = true;
  } catch {
    formSummary = null;
    formSummaryAvailable = false;
  }

  return {
    status,
    summary,
    formSummary,
    formSummaryAvailable,
    loadedAt: new Date().toISOString(),
    dataSource: "live database"
  };
}

function renderExportSection(content: DashboardContent, exportStatus: ExportStatus) {
  if (exportStatus.phase === "running") {
    const progress = formatApplication2UiExportProgress(exportStatus.current, exportStatus.total);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, { bold: true }, "Export"),
      React.createElement(Text, null, "  Export: running"),
      React.createElement(Text, null, `  Records: ${progress.recordText}`),
      React.createElement(Text, null, `  Progress: ${progress.percentText}`),
      React.createElement(Text, null, `  Output: ${exportStatus.plan.out}`)
    );
  }

  if (exportStatus.phase === "complete") {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, { bold: true }, "Export"),
      React.createElement(Text, { color: "green" }, "  Export: complete"),
      React.createElement(Text, null, `  Output: ${exportStatus.result.outPath}`),
      React.createElement(Text, null, `  Record count: ${exportStatus.result.recordCount}`),
      React.createElement(Text, null, `  Export file ID: ${exportStatus.result.exportFileId}`),
      React.createElement(Text, null, `  Validation errors: ${exportStatus.result.validationErrorCount}`)
    );
  }

  if (exportStatus.phase === "failed") {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, { bold: true }, "Export"),
      React.createElement(Text, { color: "red" }, "  Export: failed"),
      React.createElement(Text, null, `  Error: ${exportStatus.error}`),
      React.createElement(Text, null, `  Output: ${exportStatus.plan.out}`)
    );
  }

  const readiness = buildApplication2UiExportReadiness(
    content,
    content.formSummary,
    content.formSummaryAvailable
  );
  if (!readiness.ready) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, { bold: true }, "Export"),
      React.createElement(Text, { color: "yellow" }, `  ${readiness.reason}`)
    );
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Text, { bold: true }, "Export"),
    React.createElement(Text, { color: "green" }, "  Export: ready | Press e to export"),
    React.createElement(Text, null, `  Run ID: ${readiness.plan.runId}`),
    React.createElement(Text, null, `  Form: ${readiness.plan.formName}`),
    React.createElement(Text, null, `  Export spec ID: ${readiness.plan.exportSpecId}`),
    React.createElement(Text, null, `  Mapping set ID: ${readiness.plan.mappingSetId}`),
    React.createElement(Text, null, `  Output: ${readiness.plan.out}`)
  );
}

function DashboardUi() {
  const { exit } = useApp();
  const [state, setState] = React.useState<DashboardState>({
    data: null,
    error: null,
    exportStatus: { phase: "idle" },
    loading: true,
    notice: null,
    spinnerIndex: 0
  });

  const startExport = React.useCallback(async (plan: Application2UiExportPlan) => {
    setState((current) => ({
      ...current,
      exportStatus: { phase: "running", plan, current: 0, total: 0 },
      notice: null
    }));

    try {
      const pool = await getApplication2Pool();
      const result = await runApplication2ExportWorkflow(
        pool,
        {
          runId: plan.runId,
          exportSpecId: plan.exportSpecId,
          mappingSetId: plan.mappingSetId,
          out: plan.out,
          json: false
        },
        {
          onRecordWritten: async ({ current, total }) => {
            setState((existing) => {
              if (existing.exportStatus.phase !== "running") return existing;
              return {
                ...existing,
                exportStatus: {
                  ...existing.exportStatus,
                  current,
                  total
                }
              };
            });
          }
        }
      );

      setState((current) => ({
        ...current,
        exportStatus: {
          phase: "complete",
          plan,
          result: buildApplication2UiExportCompleteView(result)
        },
        notice: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        exportStatus: {
          phase: "failed",
          plan,
          error: sanitizeApplication2UiExportError(error)
        },
        notice: null
      }));
    }
  }, []);

  const refresh = React.useCallback(async () => {
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      exportStatus: { phase: "idle" },
      notice: null
    }));

    try {
      const data = await loadDashboardData();
      setState((current) => ({ ...current, data, loading: false, error: null }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        exportStatus: { phase: "idle" },
        error: errorMessage(error)
      }));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!state.loading) {
      setState((current) => (current.spinnerIndex === 0 ? current : { ...current, spinnerIndex: 0 }));
      return;
    }

    const timer = setInterval(() => {
      setState((current) => ({
        ...current,
        spinnerIndex: (current.spinnerIndex + 1) % SPINNER_FRAMES.length
      }));
    }, 120);

    return () => clearInterval(timer);
  }, [state.loading]);

  useInput((input, key) => {
    const blockedNotice = getApplication2UiExportBlockedNotice(state.exportStatus.phase);
    if (key.ctrl && input === "c") {
      if (blockedNotice) {
        setState((current) => ({ ...current, notice: blockedNotice }));
        return;
      }
      exit();
      return;
    }

    if (input.toLowerCase() === "q") {
      if (blockedNotice) {
        setState((current) => ({ ...current, notice: blockedNotice }));
        return;
      }
      exit();
      return;
    }

    if (input.toLowerCase() === "r" && !state.loading) {
      if (blockedNotice) {
        setState((current) => ({ ...current, notice: blockedNotice }));
        return;
      }
      void refresh();
      return;
    }

    if (input.toLowerCase() === "e" && !state.loading) {
      if (blockedNotice) {
        setState((current) => ({ ...current, notice: blockedNotice }));
        return;
      }
      if (!state.data || state.exportStatus.phase !== "idle") return;

      const readiness = buildApplication2UiExportReadiness(
        state.data,
        state.data.formSummary,
        state.data.formSummaryAvailable
      );
      if (!readiness.ready) {
        setState((current) => ({ ...current, notice: readiness.reason }));
        return;
      }

      void startExport(readiness.plan);
    }
  });

  const content = state.data;
  const spinner = SPINNER_FRAMES[state.spinnerIndex];

  return React.createElement(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: state.error ? "red" : "cyan",
      paddingX: 1,
      paddingY: 0,
      width: 96
    },
    React.createElement(Text, { bold: true, color: "cyan" }, "Application 2 Dashboard"),
    React.createElement(
      Text,
      null,
      state.loading
        ? `Status: loading ${spinner}`
        : state.error
          ? "Status: error"
          : `Status: ready | loaded ${formatTimestamp(content?.loadedAt ?? null)}`
    ),
    React.createElement(Text, null, `Data source: ${content?.dataSource ?? selectedDataSource()}`),
    state.error ? React.createElement(Text, { color: "red" }, state.error) : null,
    state.notice ? React.createElement(Text, { color: "yellow" }, state.notice) : null,
    content
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, { bold: true }, "Database"),
          React.createElement(Text, null, `Name: ${content.summary.database}`),
          React.createElement(
            Text,
            null,
            `Connected tables: ${Object.values(content.status.tables).filter(Boolean).length}/${Object.keys(content.status.tables).length}`
          ),
          React.createElement(Text, { bold: true }, "Counts"),
          ...Object.entries(content.summary.counts).map(([key, value]) =>
            React.createElement(Text, { key }, `  ${formatLabel(key)}: ${formatValue(value)}`)
          ),
          React.createElement(Text, { bold: true }, "Latest run"),
          React.createElement(Text, null, `  Run ID: ${formatValue(content.summary.latest_run?.run_id)}`),
          React.createElement(Text, null, `  Name: ${formatValue(content.summary.latest_run?.run_name)}`),
          React.createElement(Text, null, `  Status: ${formatValue(content.summary.latest_run?.status)}`),
          React.createElement(Text, null, `  Started: ${formatTimestamp(content.summary.latest_run?.started_at ?? null)}`),
          React.createElement(Text, null, `  Finished: ${formatTimestamp(content.summary.latest_run?.finished_at ?? null)}`),
          React.createElement(Text, { bold: true }, "Latest export file"),
          React.createElement(
            Text,
            null,
            `  Export file ID: ${formatValue(content.summary.latest_export_file?.export_file_id)}`
          ),
          React.createElement(Text, null, `  Path: ${formatValue(content.summary.latest_export_file?.file_path)}`),
          React.createElement(
            Text,
            null,
            `  Record count: ${formatValue(content.summary.latest_export_file?.record_count)}`
          ),
          React.createElement(
            Text,
            null,
            `  Created: ${formatTimestamp(content.summary.latest_export_file?.created_at ?? null)}`
          ),
          renderExportSection(content, state.exportStatus),
          React.createElement(Text, { bold: true }, "Required tables"),
          ...Object.entries(content.status.tables).map(([table, exists]) =>
            React.createElement(
              Text,
              { key: table, color: exists ? "green" : "red" },
              `  ${exists ? "OK" : "MISSING"} ${table}`
            )
          )
        )
      : null,
    React.createElement(
      Text,
      { dimColor: true },
      state.exportStatus.phase === "running"
        ? "Keys: export running; wait for completion"
        : "Keys: r refresh, e export when ready, q quit, Ctrl+C quit"
    ),
    state.loading ? React.createElement(Text, { color: "yellow" }, `Loading ${spinner}`) : null
  );
}

async function main() {
  const app = render(React.createElement(DashboardUi));

  try {
    await app.waitUntilExit();
  } finally {
    try {
      await Promise.race([
        closeApplication2Pool(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000))
      ]);
    } catch (err) {
      // Best-effort close; log and continue so UI can exit promptly
      // eslint-disable-next-line no-console
      console.error("Failed to close application2 DB pool:", err);
    }
    // Ensure Node process terminates even if there are lingering handles.
    // Defer exit so any pending console output can flush.
    setImmediate(() => process.exit(0));
  }
}

main().catch((error) => {
  console.error("Failed to run Application 2 Ink UI:", error);
  process.exitCode = 1;
});
