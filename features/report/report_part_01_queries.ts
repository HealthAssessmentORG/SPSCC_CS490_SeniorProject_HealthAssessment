import { DbPool, execSql, sql } from "../../db/db_connect";

export async function getRunSummary(pool: DbPool, runId: string) {
  const rs = await execSql(pool, `
    SELECT run_id, run_name, seed, target_record_count, started_at, finished_at, status
    FROM dbo.[RUN]
    WHERE run_id = @id
  `, { id: { type: sql.UniqueIdentifier, value: runId } });

  return rs.recordset[0] ?? null;
}

export async function getValidationErrorCounts(pool: DbPool, exportFileId: string) {
  const rs = await execSql(pool, `
    SELECT error_code, COUNT(*) AS cnt
    FROM dbo.VALIDATION_ERROR
    WHERE export_file_id = @id
    GROUP BY error_code
    ORDER BY cnt DESC
  `, { id: { type: sql.UniqueIdentifier, value: exportFileId } });

  return rs.recordset;
}
