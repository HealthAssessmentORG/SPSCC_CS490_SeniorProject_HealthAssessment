import React from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

import {
  closeApplication2Pool,
  getApplication2DbConfigFromEnv,
  getApplication2Pool,
  sql
} from "./src/db_connect.js";
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
  formatApplication2UiExportFilenameDisplay,
  formatApplication2UiExportProgress,
  formatApplication2UiRunId,
  getApplication2UiExportBlockedNotice,
  sanitizeApplication2UiExportFilenameToken,
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
  exportFilenameToken: string | null;
  loading: boolean;
  notice: string | null;
  filenameEditDraft: string | null;
  spinnerIndex: number;
};

type ValidationProgress = {
  current: number;
  total: number;
  message: string;
};

type UiPhase = "welcome" | "dashboard";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function requestExit(exit: () => void) {
  exit();
  process.exit(0);
}

function readConnectionTarget(): string {
  try {
    const config = getApplication2DbConfigFromEnv();
    const server = config.port ? `${config.server},${config.port}` : config.server;

    if (server && config.database) {
      return `${server} / ${config.database}`;
    }
  } catch {
    // Keep the validation screen resilient when the environment is misconfigured.
  }

  return "Application 2 MSSQL database";
}

async function validateApplication2Connection(
  onProgress: (progress: ValidationProgress) => void
): Promise<void> {
  const config = getApplication2DbConfigFromEnv();
  onProgress({
    current: 1,
    total: 3,
    message: `Opening SQL Server connection for ${readConnectionTarget()}`
  });

  const pool = await new sql.ConnectionPool(config).connect();

  try {
    onProgress({ current: 2, total: 3, message: "Running validation query (SELECT 1)..." });
    const result = await pool.request().query("SELECT 1 AS ok");
    if (!result.recordset || result.recordset.length === 0) {
      throw new Error("Validation query returned no rows.");
    }
  } finally {
    onProgress({ current: 3, total: 3, message: "Closing validation connection..." });
    await pool.close();
  }
}

function PhaseTitle(props: { phase: UiPhase }) {
  if (props.phase === "welcome") {
    return "Checking Application 2 Connection";
  }

  return "Application 2 Dashboard";
}

function ConnectionTestUi(props: { onContinue: () => void }) {
  const { exit } = useApp();
  const [connectionStatus, setConnectionStatus] = React.useState("Preparing validation target...");
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [connectionReady, setConnectionReady] = React.useState(false);
  const [validationAttempt, setValidationAttempt] = React.useState(0);
  const [connectionProgress, setConnectionProgress] = React.useState<ValidationProgress>({
    current: 0,
    total: 3,
    message: "Preparing validation target..."
  });
  const [spinnerIndex, setSpinnerIndex] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    const runValidation = async () => {
      setConnectionReady(false);
      setConnectionError(null);
      setConnectionStatus("Preparing validation target...");
      setConnectionProgress({ current: 0, total: 3, message: "Preparing validation target..." });

      try {
        await validateApplication2Connection((progress: ValidationProgress) => {
          if (!cancelled) {
            setConnectionStatus(progress.message);
            setConnectionProgress(progress);
          }
        });
        if (!cancelled) {
          setConnectionStatus("Connection verified. Press Enter or Space to continue.");
          setConnectionReady(true);
          setConnectionProgress({
            current: 3,
            total: 3,
            message: "Connection verified. Press Enter or Space to continue."
          });
        }
      } catch (error) {
        if (!cancelled) {
          setConnectionError(error instanceof Error ? error.message : String(error));
          setConnectionReady(false);
          setConnectionProgress((current) => ({
            ...current,
            message: "Validation failed. Press r to retry or Ctrl+C to quit."
          }));
        }
      }
    };

    void runValidation();
    return () => {
      cancelled = true;
    };
  }, [validationAttempt]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setSpinnerIndex((current: number) => (current + 1) % 4);
    }, 120);

    return () => clearInterval(timer);
  }, []);

  useInput((input, key) => {
    if (connectionReady && (key.return || input === " ")) {
      props.onContinue();
      return;
    }

    if (input.toLowerCase() === "r") {
      setConnectionError(null);
      setConnectionReady(false);
      setValidationAttempt((current) => current + 1);
      return;
    }

    if (key.ctrl && input === "c") {
      requestExit(exit);
    }
  });

  const spinner = ["|", "/", "-", "\\"][spinnerIndex];
  const title = connectionReady
    ? "Application 2 Connection Verified"
    : connectionError
      ? "Application 2 Connection Failed"
      : PhaseTitle({ phase: "welcome" });
  const progressPercent = Math.min(
    100,
    Math.round((connectionProgress.current / connectionProgress.total) * 100)
  );
  const progressBarLength = 12;
  const progressFilled = Math.round((progressPercent / 100) * progressBarLength);
  const progressBar = `${"█".repeat(progressFilled)}${"░".repeat(progressBarLength - progressFilled)}`;

  return React.createElement(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0, width: 96 },
    React.createElement(Text, { bold: true, color: "cyan" }, title),
    React.createElement(Text, null, connectionStatus),
    React.createElement(
      Text,
      null,
      `Progress: [${progressBar}] ${progressPercent}% (${connectionProgress.current}/${connectionProgress.total})`
    ),
    React.createElement(Text, null, `Target: ${readConnectionTarget()}`),
    connectionError ? React.createElement(Text, { color: "red" }, `Error: ${connectionError}`) : null,
    connectionReady
      ? React.createElement(Text, { color: "green" }, "Connection validated. Press Enter or Space to continue.")
      : React.createElement(Text, { color: "yellow" }, `Connecting ${spinner}`),
    React.createElement(
      Text,
      { dimColor: true },
      connectionReady
        ? "Press r to recheck, Ctrl+C to quit."
        : "Wait for validation to finish; press r to retry or Ctrl+C to quit."
    )
  );
}

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

function renderExportSection(
  content: DashboardContent,
  exportStatus: ExportStatus,
  exportFilenameToken: string | null
) {
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
      React.createElement(Text, null, `  Output: ${exportStatus.result.outPath}`)
    );
  }

  if (exportStatus.phase === "failed") {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, { bold: true }, "Export"),
      React.createElement(Text, { color: "red" }, "  Export: failed"),
      React.createElement(Text, null, `  Error: ${exportStatus.error}`),
      React.createElement(Text, null, `  Output: ${formatApplication2UiExportFilenameDisplay()}`)
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
    React.createElement(Text, null, `  Run ID: ${formatApplication2UiRunId(readiness.plan.runId)}`),
    React.createElement(Text, null, `  Output: ${formatApplication2UiExportFilenameDisplay(exportFilenameToken)}`)
  );
}

function DashboardUi() {
  const { exit } = useApp();
  const [state, setState] = React.useState<DashboardState>({
    data: null,
    error: null,
    exportStatus: { phase: "idle" },
    exportFilenameToken: null,
    loading: true,
    notice: null,
    filenameEditDraft: null,
    spinnerIndex: 0
  });

  const commitExportFilenameToken = React.useCallback((draft: string) => {
    const token = sanitizeApplication2UiExportFilenameToken(draft);
    if (!token) {
      setState((current) => ({
        ...current,
        filenameEditDraft: null,
        notice: "Export filename token cannot be empty."
      }));
      return;
    }

    setState((current) => ({
      ...current,
      exportFilenameToken: token,
      filenameEditDraft: null,
      notice: `Export filename token set to ${token}.`
    }));
  }, []);

  const startExport = React.useCallback(async (plan: Application2UiExportPlan) => {
    setState((current) => ({
      ...current,
      exportStatus: { phase: "running", plan, current: 0, total: 0 },
      filenameEditDraft: null,
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
      filenameEditDraft: null,
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
        filenameEditDraft: null,
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

    if (state.filenameEditDraft !== null) {
      if (key.escape) {
        setState((current) => ({ ...current, filenameEditDraft: null, notice: null }));
        return;
      }

      if (key.backspace) {
        setState((current) => ({
          ...current,
          filenameEditDraft: current.filenameEditDraft ? current.filenameEditDraft.slice(0, -1) : ""
        }));
        return;
      }

      if (key.return) {
        commitExportFilenameToken(state.filenameEditDraft);
        return;
      }

      if (!key.ctrl && !key.meta && input) {
        setState((current) => ({
          ...current,
          filenameEditDraft: `${current.filenameEditDraft ?? ""}${input}`
        }));
      }
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
        state.data.formSummaryAvailable,
        state.exportFilenameToken
      );
      if (!readiness.ready) {
        setState((current) => ({ ...current, notice: readiness.reason }));
        return;
      }

      void startExport(readiness.plan);
      return;
    }

    if (input.toLowerCase() === "f" && !state.loading) {
      if (blockedNotice) {
        setState((current) => ({ ...current, notice: blockedNotice }));
        return;
      }

      setState((current) => ({
        ...current,
        filenameEditDraft: current.exportFilenameToken ?? "",
        notice: "Type the replacement text for RunID, then press Enter to save or Esc to cancel."
      }));
    }
  });

  const content = state.data;
  const spinner = SPINNER_FRAMES[state.spinnerIndex];
  const hiddenCountKeys = new Set([
    "runs",
    "provider_reviews",
    "export_specs",
    "export_fields",
    "mapping_sets",
    "mapping_rules",
    "export_files",
    "validation_errors"
  ]);
  const visibleCounts = content
    ? Object.entries(content.summary.counts).filter(([key]) => !hiddenCountKeys.has(key))
    : [];
  const filenameEditor =
    state.filenameEditDraft !== null
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, { bold: true }, "Filename"),
          React.createElement(
            Text,
            null,
            `  export_${state.filenameEditDraft || "RunID"}.txt`
          ),
          React.createElement(
            Text,
            { dimColor: true },
            "  Type the replacement text for RunID, then press Enter to save or Esc to cancel."
          )
        )
      : null;

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
          : "Status: ready"
    ),
    state.error ? React.createElement(Text, { color: "red" }, state.error) : null,
    state.notice ? React.createElement(Text, { color: "yellow" }, state.notice) : null,
    content
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, { bold: true }, "Counts"),
          ...visibleCounts.map(([key, value]) =>
            React.createElement(Text, { key }, `  ${formatLabel(key)}: ${formatValue(value)}`)
          ),
          renderExportSection(content, state.exportStatus, state.exportFilenameToken),
          filenameEditor
        )
      : null,
    React.createElement(
      Text,
      { dimColor: true },
      state.exportStatus.phase === "running"
        ? "Keys: export running; wait for completion"
        : state.filenameEditDraft !== null
          ? "Keys: Enter save, Esc cancel, Backspace delete, Ctrl+C quit"
          : "Keys: r refresh, e export when ready, f set filename, Ctrl+C quit"
    ),
    state.loading ? React.createElement(Text, { color: "yellow" }, `Loading ${spinner}`) : null
  );
}

function Application2UiApp() {
  const [phase, setPhase] = React.useState<UiPhase>("welcome");

  if (phase === "welcome") {
    return React.createElement(ConnectionTestUi, {
      onContinue: () => setPhase("dashboard")
    });
  }

  return React.createElement(DashboardUi);
}

async function main() {
  const app = render(React.createElement(Application2UiApp));

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
