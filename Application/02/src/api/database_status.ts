import { getApplication2Pool, type DbPool } from "../db_connect.js";
import { loadDatabaseStatus as loadDatabaseStatusFromRepository } from "../repositories/database_status_repository.js";
import type { Application2DatabaseStatus } from "../types.js";
import { safeApplication2DbConfigError } from "./db_error.js";

export type Application2DatabaseStatusDeps = {
  getPool?: () => Promise<DbPool>;
  loadDatabaseStatus?: (pool: DbPool) => Promise<Application2DatabaseStatus>;
};

export type Application2DatabaseStatusBody =
  | ({ ok: true } & Application2DatabaseStatus)
  | { ok: false; error: string };

export type Application2DatabaseStatusResponse = {
  statusCode: 200 | 503;
  body: Application2DatabaseStatusBody;
};

export function sanitizeDatabaseStatusError(error: unknown): string {
  const safeDbError = safeApplication2DbConfigError(error);
  if (safeDbError) return safeDbError;

  const message = error instanceof Error ? error.message : String(error);
  if (/^Missing required database tables: [A-Z0-9_, ]+$/.test(message)) {
    return message;
  }

  return "Database status check failed";
}

export async function getApplication2DatabaseStatus(
  deps: Application2DatabaseStatusDeps = {}
): Promise<Application2DatabaseStatusResponse> {
  try {
    const getPool = deps.getPool ?? getApplication2Pool;
    const loadDatabaseStatus = deps.loadDatabaseStatus ?? loadDatabaseStatusFromRepository;
    const pool = await getPool();
    const status = await loadDatabaseStatus(pool);

    return {
      statusCode: 200,
      body: {
        ok: true,
        database: status.database,
        tables: status.tables
      }
    };
  } catch (error) {
    return {
      statusCode: 503,
      body: {
        ok: false,
        error: sanitizeDatabaseStatusError(error)
      }
    };
  }
}
