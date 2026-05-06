import { type DbPool, execSql, sql } from "../db_connect.js";
import type { Application2RunSummary, Application2ValidationErrorCount } from "../types.js";

export async function loadRunSummary(pool: DbPool, runId: string): Promise<Application2RunSummary | null> {
  const result = await execSql(
    pool,
    `
      SELECT run_id, run_name, seed, target_record_count, started_at, finished_at, status
      FROM dbo.[RUN]
      WHERE run_id = @id
    `,
    { id: { type: sql.UniqueIdentifier, value: runId } }
  );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    run_id: String(row["run_id"]),
    run_name: row["run_name"] == null ? null : String(row["run_name"]),
    seed: row["seed"] == null ? null : Number(row["seed"]),
    target_record_count: Number(row["target_record_count"]),
    started_at: row["started_at"] as Application2RunSummary["started_at"],
    finished_at: row["finished_at"] as Application2RunSummary["finished_at"],
    status: String(row["status"])
  };
}

export async function loadValidationErrorCounts(
  pool: DbPool,
  exportFileId: string
): Promise<Application2ValidationErrorCount[]> {
  const result = await execSql(
    pool,
    `
      SELECT error_code, COUNT(*) AS cnt
      FROM dbo.VALIDATION_ERROR
      WHERE export_file_id = @id
      GROUP BY error_code
      ORDER BY cnt DESC
    `,
    { id: { type: sql.UniqueIdentifier, value: exportFileId } }
  );

  return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
    error_code: String(row["error_code"]),
    cnt: Number(row["cnt"])
  }));
}
