import { type DbPool, execSql, sql } from "../db_connect.js";

export async function loadAssessmentIdsForRun(pool: DbPool, runId: string): Promise<string[]> {
  const result = await execSql(
    pool,
    `
      SELECT assessment_id
      FROM dbo.ASSESSMENT
      WHERE run_id = @id
      ORDER BY assessment_id
    `,
    { id: { type: sql.UniqueIdentifier, value: runId } }
  );

  return (result.recordset as Array<{ assessment_id: unknown }>).map((row) => String(row.assessment_id));
}

export async function updateRunStatus(pool: DbPool, runId: string, status: string): Promise<void> {
  await execSql(
    pool,
    `
      UPDATE dbo.[RUN]
      SET status = @st, finished_at = SYSUTCDATETIME()
      WHERE run_id = @id
    `,
    {
      st: { type: sql.NVarChar(30), value: status },
      id: { type: sql.UniqueIdentifier, value: runId }
    }
  );
}
