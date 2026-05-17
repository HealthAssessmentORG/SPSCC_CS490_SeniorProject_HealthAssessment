import { readFile } from "node:fs/promises";

import type { Application2DatabaseStatus, Application2DatabaseSummary } from "./types.js";

export const APP2_UI_DEMO_DATA_PATH_ENV = "APP2_UI_DEMO_DATA_PATH";

export type Application2UiDataSource = "live database" | "saved demo data";

export type Application2DashboardData = {
  status: Application2DatabaseStatus;
  summary: Application2DatabaseSummary;
  loadedAt: string;
  dataSource: Application2UiDataSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Application 2 UI demo data ${fieldName} must be an object`);
  }
  return value;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Application 2 UI demo data ${fieldName} must be a string`);
  }
  return value;
}

function requireTrue(value: unknown, fieldName: string): void {
  if (value !== true) {
    throw new Error(`Application 2 UI demo data ${fieldName} must be true`);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Application 2 UI demo data is not valid JSON");
  }
}

export function readApplication2UiDemoDataPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[APP2_UI_DEMO_DATA_PATH_ENV];
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}

export function parseApplication2UiDemoData(value: unknown): {
  status: Application2DatabaseStatus;
  summary: Application2DatabaseSummary;
} {
  const root = requireRecord(value, "root");
  const statusRoot = requireRecord(root["status"], "status");
  const summaryRoot = requireRecord(root["summary"], "summary");

  requireTrue(statusRoot["ok"], "status.ok");
  requireTrue(summaryRoot["ok"], "summary.ok");

  const statusTables = requireRecord(statusRoot["tables"], "status.tables");
  const summaryCounts = requireRecord(summaryRoot["counts"], "summary.counts");

  return {
    status: {
      database: requireString(statusRoot["database"], "status.database"),
      tables: statusTables as Record<string, boolean>
    },
    summary: {
      database: requireString(summaryRoot["database"], "summary.database"),
      counts: summaryCounts as Application2DatabaseSummary["counts"],
      latest_run: (summaryRoot["latest_run"] ?? null) as Application2DatabaseSummary["latest_run"],
      latest_export_file: (summaryRoot["latest_export_file"] ?? null) as Application2DatabaseSummary["latest_export_file"]
    }
  };
}

export async function loadApplication2UiDemoData(
  path: string,
  now: () => Date = () => new Date()
): Promise<Application2DashboardData> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error("Application 2 UI demo data could not be read");
  }

  const parsed = parseApplication2UiDemoData(parseJson(text));

  return {
    status: parsed.status,
    summary: parsed.summary,
    loadedAt: now().toISOString(),
    dataSource: "saved demo data"
  };
}
