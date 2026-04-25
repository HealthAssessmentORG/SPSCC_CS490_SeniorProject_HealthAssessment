import { type DbPool, execSql, sql } from "../db_connect";
import type { Application2RecordContext } from "../types";

export async function loadExportRecordContext(
  pool: DbPool,
  assessmentId: string
): Promise<Application2RecordContext> {
  const assessment = (
    await execSql(pool, "SELECT * FROM dbo.ASSESSMENT WHERE assessment_id=@id", {
      id: { type: sql.UniqueIdentifier, value: assessmentId }
    })
  ).recordset[0] ?? null;

  const deployer = (
    await execSql(
      pool,
      `
        SELECT d.* FROM dbo.DEPLOYER d
        JOIN dbo.ASSESSMENT a ON a.deployer_id = d.deployer_id
        WHERE a.assessment_id = @id
      `,
      { id: { type: sql.UniqueIdentifier, value: assessmentId } }
    )
  ).recordset[0] ?? null;

  const providerReview = (
    await execSql(pool, "SELECT * FROM dbo.PROVIDER_REVIEW WHERE assessment_id=@id", {
      id: { type: sql.UniqueIdentifier, value: assessmentId }
    })
  ).recordset[0] ?? null;

  const responses = await execSql(
    pool,
    `
      SELECT question_code, field_name, value_norm
      FROM dbo.RESPONSE
      WHERE assessment_id = @id
    `,
    { id: { type: sql.UniqueIdentifier, value: assessmentId } }
  );

  const responseMap = new Map<string, string>();
  for (const row of responses.recordset as Array<{ question_code: unknown; field_name: unknown; value_norm: unknown }>) {
    responseMap.set(`${String(row.question_code)}:${String(row.field_name)}`, String(row.value_norm ?? ""));
  }

  return {
    assessment,
    deployer,
    provider_review: providerReview,
    responses: responseMap
  };
}
