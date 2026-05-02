import React from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import dotenv from "dotenv";

dotenv.config();

import { closeApplication2Pool } from "./src/db_connect";
import { getApplication2DatabaseStatus } from "./src/api/database_status";
import { getApplication2DatabaseSummary } from "./src/api/database_summary";
import type { Application2DatabaseStatus, Application2DatabaseSummary } from "./src/types";

type DashboardData = {
  status: Application2DatabaseStatus;
  summary: Application2DatabaseSummary;
  loadedAt: string;
};

type DashboardState = {
  data: DashboardData | null;
  error: string | null;
  loading: boolean;
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

async function loadDashboardData(): Promise<DashboardData> {
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

  return {
    status,
    summary,
    loadedAt: new Date().toISOString()
  };
}

function DashboardUi() {
  const { exit } = useApp();
  const [state, setState] = React.useState<DashboardState>({
    data: null,
    error: null,
    loading: true,
    spinnerIndex: 0
  });

  const refresh = React.useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const data = await loadDashboardData();
      setState((current) => ({ ...current, data, loading: false, error: null }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
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
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (input.toLowerCase() === "q") {
      exit();
      return;
    }

    if (input.toLowerCase() === "r" && !state.loading) {
      void refresh();
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
    state.error ? React.createElement(Text, { color: "red" }, state.error) : null,
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
    React.createElement(Text, { dimColor: true }, "Keys: r refresh, q quit, Ctrl+C quit"),
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