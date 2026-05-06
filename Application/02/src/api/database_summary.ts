import { getApplication2Pool, type DbPool } from "../db_connect.js";
import { loadDatabaseSummary as loadDatabaseSummaryFromRepository } from "../repositories/database_summary_repository.js";
import type { Application2DatabaseSummary } from "../types.js";
import { safeApplication2DbConfigError } from "./db_error.js";

export type Application2DatabaseSummaryDeps = {
  getPool?: () => Promise<DbPool>;
  loadDatabaseSummary?: (pool: DbPool) => Promise<Application2DatabaseSummary>;
};

export type Application2DatabaseSummaryBody =
  | ({ ok: true } & Application2DatabaseSummary)
  | { ok: false; error: string };

export type Application2DatabaseSummaryResponse = {
  statusCode: 200 | 503;
  body: Application2DatabaseSummaryBody;
};

export function sanitizeDatabaseSummaryError(error: unknown): string {
  return safeApplication2DbConfigError(error) ?? "Database summary check failed";
}

export async function getApplication2DatabaseSummary(
  deps: Application2DatabaseSummaryDeps = {}
): Promise<Application2DatabaseSummaryResponse> {
  try {
    const getPool = deps.getPool ?? getApplication2Pool;
    const loadDatabaseSummary = deps.loadDatabaseSummary ?? loadDatabaseSummaryFromRepository;
    const pool = await getPool();
    const summary = await loadDatabaseSummary(pool);

    return {
      statusCode: 200,
      body: {
        ok: true,
        database: summary.database,
        counts: summary.counts,
        latest_run: summary.latest_run,
        latest_export_file: summary.latest_export_file
      }
    };
  } catch (error) {
    return {
      statusCode: 503,
      body: {
        ok: false,
        error: sanitizeDatabaseSummaryError(error)
      }
    };
  }
}
