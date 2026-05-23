import { type DbPool, execSql, sql } from "../db_connect.js";
import type { Application2RecordContext } from "../types.js";

function assessmentIdParam(assessmentId: string) {
  return { type: sql.BigInt, value: assessmentId };
}

function setResponseValue(responseMap: Map<string, string>, key: string, value: string) {
  if (responseMap.has(key)) {
    throw new Error(`Duplicate response key from dbo.vw_Response: ${key}`);
  }
  responseMap.set(key, value);
}

export async function loadExportRecordContext(
  pool: DbPool,
  assessmentId: string
): Promise<Application2RecordContext> {
  const assessment = (
    await execSql(pool, "SELECT * FROM dbo.ASSESSMENT WHERE assessment_id=@id", {
      id: assessmentIdParam(assessmentId)
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
      { id: assessmentIdParam(assessmentId) }
    )
  ).recordset[0] ?? null;

  const providerReview = (
    await execSql(pool, "SELECT * FROM dbo.PROVIDER_REVIEW WHERE assessment_id=@id", {
      id: assessmentIdParam(assessmentId)
    })
  ).recordset[0] ?? null;

  const responses = await execSql(
    pool,
    `
      SELECT question_code, field_name, value_raw, value_norm
      FROM dbo.vw_Response
      WHERE assessment_id = @id
    `,
    { id: assessmentIdParam(assessmentId) }
  );

  const responseMap = new Map<string, string>();
  for (const row of responses.recordset as Array<{
    question_code: unknown;
    field_name: unknown;
    value_raw: unknown;
    value_norm: unknown;
  }>) {
    const fieldName = String(row.field_name);
    const value = String(row.value_norm ?? row.value_raw ?? "");
    setResponseValue(responseMap, fieldName, value);
    setResponseValue(responseMap, `${String(row.question_code)}:${fieldName}`, value);
  }

  return {
    assessment,
    deployer,
    provider_review: providerReview,
    responses: responseMap
  };
}
