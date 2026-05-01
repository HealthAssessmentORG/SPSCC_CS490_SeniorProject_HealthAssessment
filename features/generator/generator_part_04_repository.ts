import { randomUUID } from "node:crypto";

import { type DbPool, execSql, sql } from "../../db/db_connect";

export type AssessmentInsertRow = {
  deployer_id: string;
  event_date: string;
  form_type_observed: string;
  form_version_observed: string;
};

export type ResponseInsertRow = {
  question_code: string;
  field_name: string;
  value_raw: string;
  value_norm?: string;
};

export type ProviderReviewInsertRow = {
  provider_name: string;
  certify_date: string;
  provider_title: string;
  provider_signature: string;
};

export async function upsertDeployerByDodId(pool: DbPool, dodid: string): Promise<string> {
  // MERGE is concurrency-safe and returns the deployer_id whether it was inserted or already existed.
  const newId = randomUUID();

  const res = await execSql(
    pool,
    `
    MERGE dbo.DEPLOYER WITH (HOLDLOCK) AS t
    USING (SELECT @dodid AS dod_id) AS s
      ON t.dod_id = s.dod_id
    WHEN MATCHED THEN
      UPDATE SET dod_id = t.dod_id  -- no-op, but allows OUTPUT
    WHEN NOT MATCHED THEN
      INSERT (deployer_id, dod_id)
      VALUES (@newId, @dodid)
    OUTPUT inserted.deployer_id AS deployer_id;
    `,
    {
      dodid: { type: sql.Char(10), value: dodid },
      newId: { type: sql.UniqueIdentifier, value: newId }
    }
  );

  return String(res.recordset[0].deployer_id);
}

export async function insertRun(pool: DbPool, runName: string, seed: number, target: number): Promise<string> {
  const run_id = randomUUID();
  await execSql(pool, `
    INSERT INTO dbo.[RUN] (run_id, run_name, seed, target_record_count, status)
    VALUES (@id, @name, @seed, @target, N'running')
  `, {
    id: { type: sql.UniqueIdentifier, value: run_id },
    name: { type: sql.NVarChar(200), value: runName },
    seed: { type: sql.Int, value: seed },
    target: { type: sql.Int, value: target }
  });
  return run_id;
}

export async function insertAssessment(pool: DbPool, run_id: string, row: AssessmentInsertRow): Promise<string> {
  const assessment_id = randomUUID();

  await execSql(pool, `
    INSERT INTO dbo.ASSESSMENT (
      assessment_id, run_id, deployer_id,
      form_type_observed, form_version_observed, event_date
    )
    VALUES (@id, @rid, @did, @ft, @fv, @ed)
  `, {
    id: { type: sql.UniqueIdentifier, value: assessment_id },
    rid: { type: sql.UniqueIdentifier, value: run_id },
    did: { type: sql.UniqueIdentifier, value: row.deployer_id },
    ft: { type: sql.NVarChar(20), value: row.form_type_observed },
    fv: { type: sql.NVarChar(50), value: row.form_version_observed },
    ed: { type: sql.Date, value: row.event_date }
  });

  return assessment_id;
}

export async function updateRunStatus(pool: DbPool, run_id: string, status: string): Promise<void> {
  await execSql(pool, `
    UPDATE dbo.[RUN]
    SET status = @st, finished_at = SYSUTCDATETIME()
    WHERE run_id = @id
  `, {
    st: { type: sql.NVarChar(30), value: status },
    id: { type: sql.UniqueIdentifier, value: run_id }
  });
}

export async function insertResponse(
  pool: DbPool,
  assessmentId: string,
  response: ResponseInsertRow
): Promise<void> {
  await execSql(pool, `
    INSERT INTO dbo.RESPONSE (response_id, assessment_id, question_code, field_name, value_raw, value_norm)
    VALUES (@id, @aid, @q, @f, @raw, @norm)
  `, {
    id: { type: sql.UniqueIdentifier, value: randomUUID() },
    aid: { type: sql.UniqueIdentifier, value: assessmentId },
    q: { type: sql.NVarChar(50), value: response.question_code },
    f: { type: sql.NVarChar(100), value: response.field_name },
    raw: { type: sql.NVarChar(4000), value: response.value_raw },
    norm: { type: sql.NVarChar(4000), value: response.value_norm ?? response.value_raw }
  });
}

export async function insertProviderReview(
  pool: DbPool,
  assessmentId: string,
  providerReview: ProviderReviewInsertRow
): Promise<void> {
  await execSql(pool, `
    INSERT INTO dbo.PROVIDER_REVIEW (assessment_id, provider_name, certify_date, provider_title, provider_signature)
    VALUES (@aid, @pn, @cd, @pt, @ps)
  `, {
    aid: { type: sql.UniqueIdentifier, value: assessmentId },
    pn: { type: sql.NVarChar(200), value: providerReview.provider_name },
    cd: { type: sql.Date, value: providerReview.certify_date },
    pt: { type: sql.NVarChar(50), value: providerReview.provider_title },
    ps: { type: sql.NVarChar(200), value: providerReview.provider_signature }
  });
}
