import { type DbPool } from "../../db/db_connect";
import { Rng } from "./generator_part_01_rng";
import {
  insertAssessment,
  insertRun,
  updateRunStatus,
  upsertDeployerByDodId
} from "./generator_part_04_repository";

export type DeployerRow = { deployer_id: string; dod_id: string };
export type AssessmentRow = { assessment_id: string; deployer_id: string; event_date: string };
export type AssessmentFormObserved = { form_type_observed: string; form_version_observed: string };
export type AssessmentSeed = AssessmentFormObserved & { deployer_id: string; event_date: string };

const deployerIdCache = new Map<string, string>();

/**
 * Retrieves or creates a deployer ID associated with a given DoD ID.
 *
 * This function first checks an in-memory cache for the deployer ID. If not found,
 * it performs a MERGE operation on the DEPLOYER table to either retrieve an existing
 * deployer_id or insert a new record with a generated UUID. The operation is
 * concurrency-safe using HOLDLOCK.
 *
 * @param pool - The database connection pool used to execute the SQL query
 * @param dodid - The Department of Defense ID (10 characters) to look up or associate with a deployer
 * @returns A promise that resolves to the deployer_id (as a string) associated with the given DoD ID
 * 
 * @remarks
 * - The function maintains an internal cache (`deployerIdCache`) to avoid redundant database queries
 * - The MERGE statement ensures atomicity when checking for existence and inserting if needed
 * - The DoD ID is trimmed of whitespace before processing
 */
async function getOrCreateDeployerId(pool: DbPool, dodid: string): Promise<string> {
  const key = dodid.trim();
  const cached = deployerIdCache.get(key);
  if (cached) return cached;

  const deployerId = await upsertDeployerByDodId(pool, key);
  deployerIdCache.set(key, deployerId);
  return deployerId;
}

/**
 * Creates a new run record in the database with the specified parameters.
 * @param pool - The database connection pool to use for the query.
 * @param runName - The name of the run to create.
 * @param seed - The seed value for random data generation.
 * @param target - The target number of records to generate.
 * @returns A promise that resolves to the unique identifier of the created run.
 */
async function createRun(pool: DbPool, runName: string, seed: number, target: number): Promise<string> {
  return insertRun(pool, runName, seed, target);
}

export function buildDeployerDodIds(rng: Rng, count: number): string[] {
  const dodIds: string[] = [];
  const used = new Set<string>();

  while (dodIds.length < count) {
    const dod = rng.digits(10);
    if (used.has(dod)) continue;
    used.add(dod);
    dodIds.push(dod);
  }

  return dodIds;
}

async function insertDeployers(pool: DbPool, dodIds: readonly string[]): Promise<DeployerRow[]> {
  const deployers: DeployerRow[] = [];

  for (const dod of dodIds) {
    const deployer_id = await getOrCreateDeployerId(pool, dod);
    deployers.push({ deployer_id, dod_id: dod });
  }

  return deployers;
}

function buildAssessmentEventBaseTimes(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Date.now());
  return out;
}

export function buildAssessmentSeeds(
  rng: Rng,
  deployers: DeployerRow[],
  count: number,
  formObserved: AssessmentFormObserved = {
    form_type_observed: "PRE",
    form_version_observed: "DD2795_202006"
  },
  eventBaseTimesMs: readonly number[] = buildAssessmentEventBaseTimes(count)
): AssessmentSeed[] {
  const out: AssessmentSeed[] = [];
  const form_type_observed = formObserved.form_type_observed;
  const form_version_observed = formObserved.form_version_observed;

  for (let i = 0; i < count; i++) {
    const dep = deployers[i % deployers.length];

    // random date within last 365 days
    const daysAgo = rng.int(0, 364);
    const event = new Date((eventBaseTimesMs[i] ?? Date.now()) - daysAgo * 24 * 3600 * 1000);
    const event_date = event.toISOString().slice(0, 10);

    out.push({
      deployer_id: dep.deployer_id,
      event_date,
      form_type_observed,
      form_version_observed
    });
  }

  return out;
}

async function insertAssessments(
  pool: DbPool,
  run_id: string,
  assessmentSeeds: readonly AssessmentSeed[]
): Promise<AssessmentRow[]> {
  const out: AssessmentRow[] = [];

  for (const a of assessmentSeeds) {
    const assessment_id = await insertAssessment(pool, run_id, a);
    out.push({ assessment_id, deployer_id: a.deployer_id, event_date: a.event_date });
  }

  return out;
}

/**
 * Finalizes a run by updating its status and completion timestamp.
 * @param pool - The database connection pool
 * @param run_id - The unique identifier of the run to finalize
 * @param status - The final status to set for the run
 * @returns A promise that resolves when the update is complete
 */
async function finishRun(pool: DbPool, run_id: string, status: string) {
  await updateRunStatus(pool, run_id, status);
}

export {
  createRun,
  insertDeployers,
  insertAssessments,
  finishRun
};
