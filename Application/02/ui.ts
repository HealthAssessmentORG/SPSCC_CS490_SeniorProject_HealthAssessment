import React from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import dotenv from "dotenv";
import fs from "node:fs";

dotenv.config({ quiet: true });

import { closeApplication2Pool, getApplication2DbConfigFromEnv, getApplication2Pool, sql, execSql } from "./src/db_connect.js";
import { runApplication2ExportWorkflow } from "./src/export.js";

// Lightweight local fallbacks for missing modules in this workspace copy.
// These provide minimal behaviour so the Ink UI can run without the full
// application codebase.

type Application2DatabaseFormSummary = { database: string; forms: any[] };

type Application2DashboardData = {
  status: any;
  summary: any;
  formSummary: Application2DatabaseFormSummary | null;
  formSummaryAvailable: boolean;
  loadedAt: string;
  dataSource: string;
};

async function getApplication2DatabaseStatus() {
  return {
    statusCode: 200,
    body: { ok: true, database: { name: "Application 2 DB" }, tables: [] }
  };
}

async function getApplication2DatabaseSummary() {
  try {
    const pool = await getApplication2Pool();

    const tables = ["assessment", "field", "response"];
    const counts: Record<string, number> = {};

    for (const tbl of tables) {
      try {
        const res = await execSql(pool, `SELECT COUNT(1) AS cnt FROM ${tbl}`);
        const cnt = (res.recordset && res.recordset[0] && (res.recordset[0].cnt ?? res.recordset[0].COUNT ?? res.recordset[0].count)) ?? 0;
        counts[tbl] = Number(cnt) || 0;
      } catch {
        counts[tbl] = 0;
      }
    }

    return {
      statusCode: 200,
      body: { ok: true, database: "Application 2 DB", counts, latest_run: null, latest_export_file: null }
    };
  } catch (error) {
    return { statusCode: 500, body: { ok: false, error: error instanceof Error ? error.message : String(error) } };
  }
}

async function loadDatabaseFormSummary(_pool: any): Promise<Application2DatabaseFormSummary> {
  return { database: "Application 2 DB", forms: [] };
}

function readApplication2UiDemoDataPath(): string {
  return process.env["APP2_UI_DEMO_DATA_PATH"] ?? "";
}

async function loadApplication2UiDemoData(path: string) {
  const raw = fs.readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  return {
    status: parsed.status ?? { database: "demo" },
    summary: parsed.summary ?? { counts: {} },
    loadedAt: new Date().toISOString(),
    dataSource: "saved demo data"
  };
}

type Application2UiExportPlan = { runId: string; exportSpecId: string; mappingSetId: string; out: string };
type Application2UiExportCompleteView = { outPath: string };
type Application2UiExportReadiness = {
  ready: boolean;
  plan: Application2UiExportPlan;
  reason?: string;
};

function sanitizeApplication2UiExportFilenameToken(draft: string | null) {
  if (!draft) return "";
  return draft.replace(/[^A-Za-z0-9-_]/g, "_");
}

function formatApplication2UiExportFilenameDisplay() {
  return "out/output.txt";
}

function formatApplication2UiExportProgress(current: number, total: number) {
  const percent = total === 0 ? 0 : Math.round((current / total) * 100);
  return { recordText: `${current}/${total}`, percentText: `${percent}%` };
}

function getApplication2UiExportBlockedNotice(_phase: any) {
  return null;
}

function buildApplication2UiExportReadiness(
  _content: any,
  _formSummary: any,
  _formSummaryAvailable: boolean
) : Application2UiExportReadiness {
  const plan: Application2UiExportPlan = {
    runId: "demo-run",
    exportSpecId: "demo-spec",
    mappingSetId: "demo-map",
    out: "out/output.txt"
  };
  return { ready: true, plan };
}

function buildApplication2UiExportCompleteView(result: any): Application2UiExportCompleteView {
  return { outPath: result.out_path ?? result.outPath ?? "out.txt" };
}

function sanitizeApplication2UiExportError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
            message: "Validation failed. Press r to retry."
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
      connectionReady ? "Press r to recheck." : "Wait for validation to finish; press r to retry."
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
    React.createElement(Text, { color: "green" }, "  Ready | Press e to export"),
    React.createElement(Text, null, `  Output: ${formatApplication2UiExportFilenameDisplay()}`)
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

    if (input.toLowerCase() === "q") {
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
        state.data.formSummaryAvailable
      );
      if (!readiness.ready) {
        setState((current) => ({ ...current, notice: "Export is not ready." }));
        return;
      }

      void startExport(readiness.plan);
      return;
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
          React.createElement(Text, null, "  out/output.txt"),
          React.createElement(
            Text,
            { dimColor: true },
            "  Export is fixed to out/output.txt."
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
          renderExportSection(content, state.exportStatus),
          filenameEditor
        )
      : null,
    React.createElement(
      Text,
      { dimColor: true },
      state.exportStatus.phase === "running"
        ? "Keys: export running; wait for completion"
        : state.filenameEditDraft !== null
          ? "Keys: Enter save, Esc cancel, Backspace delete"
          : "Keys: r refresh, e export when ready"
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
