import { DbPool, execSql, sql } from "../../db/db_connect";
import { Rng } from "./generator_part_01_rng";

import { randomUUID } from "node:crypto";

export type RunRow = { run_id: string };
export type DeployerRow = { deployer_id: string; dod_id: string };
export type AssessmentRow = { assessment_id: string; deployer_id: string; event_date: string };

const deployerIdCache = new Map<string, string>();

export async function getOrCreateDeployerId(pool: DbPool, dodid: string): Promise<string> {
  const key = dodid.trim();
  const cached = deployerIdCache.get(key);
  if (cached) return cached;

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
      dodid: { type: sql.Char(10), value: key },
      newId: { type: sql.UniqueIdentifier, value: newId }
    }
  );

  const deployerId = String(res.recordset[0].deployer_id);
  deployerIdCache.set(key, deployerId);
  return deployerId;
}

export async function createRun(pool: DbPool, runName: string, seed: number, target: number): Promise<string> {
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

export async function createDeployers(pool: DbPool, rng: Rng, count: number): Promise<DeployerRow[]> {
  const deployers: DeployerRow[] = [];
  const used = new Set<string>();

  while (deployers.length < count) {
    const dod = rng.digits(10);
    if (used.has(dod)) continue;
    used.add(dod);

    const deployer_id = await getOrCreateDeployerId(pool, dod);

    deployers.push({ deployer_id, dod_id: dod });
  }

  return deployers;
}

export async function createAssessments(
  pool: DbPool,
  run_id: string,
  rng: Rng,
  deployers: DeployerRow[],
  count: number
): Promise<AssessmentRow[]> {
  const out: AssessmentRow[] = [];

  const form_type_observed = "PRE";
  const form_version_observed = "DD2795_202006";

  for (let i = 0; i < count; i++) {
    const assessment_id = randomUUID();
    const dep = deployers[i % deployers.length];

    // random date within last 365 days
    const daysAgo = rng.int(0, 364);
    const event = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
    const event_date = event.toISOString().slice(0, 10);

    await execSql(pool, `
      INSERT INTO dbo.ASSESSMENT (
        assessment_id, run_id, deployer_id,
        form_type_observed, form_version_observed, event_date
      )
      VALUES (@id, @rid, @did, @ft, @fv, @ed)
    `, {
      id: { type: sql.UniqueIdentifier, value: assessment_id },
      rid: { type: sql.UniqueIdentifier, value: run_id },
      did: { type: sql.UniqueIdentifier, value: dep.deployer_id },
      ft: { type: sql.NVarChar(20), value: form_type_observed },
      fv: { type: sql.NVarChar(50), value: form_version_observed },
      ed: { type: sql.Date, value: event_date }
    });

    out.push({ assessment_id, deployer_id: dep.deployer_id, event_date });
  }

  return out;
}

export async function finishRun(pool: DbPool, run_id: string, status: string) {
  await execSql(pool, `
    UPDATE dbo.[RUN]
    SET status = @st, finished_at = SYSUTCDATETIME()
    WHERE run_id = @id
  `, {
    st: { type: sql.NVarChar(30), value: status },
    id: { type: sql.UniqueIdentifier, value: run_id }
  });
}
