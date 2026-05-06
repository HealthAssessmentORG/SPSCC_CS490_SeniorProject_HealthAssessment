import { type DbPool, execSql } from "../db_connect.js";
import type {
  Application2DatabaseSummary,
  Application2DatabaseSummaryCounts,
  Application2DatabaseSummaryExportFile,
  Application2DatabaseSummaryRun
} from "../types.js";
import {
  detectSupportedDatabaseSchema,
  type DatabaseSchemaDetection
} from "./database_schema.js";

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildApplication2Counts(row: Record<string, unknown> | undefined): Application2DatabaseSummaryCounts {
  return {
    runs: Number(row?.["runs"] ?? 0),
    deployers: Number(row?.["deployers"] ?? 0),
    assessments: Number(row?.["assessments"] ?? 0),
    responses: Number(row?.["responses"] ?? 0),
    provider_reviews: Number(row?.["provider_reviews"] ?? 0),
    export_specs: Number(row?.["export_specs"] ?? 0),
    export_fields: Number(row?.["export_fields"] ?? 0),
    mapping_sets: Number(row?.["mapping_sets"] ?? 0),
    mapping_rules: Number(row?.["mapping_rules"] ?? 0),
    export_files: Number(row?.["export_files"] ?? 0),
    validation_errors: Number(row?.["validation_errors"] ?? 0)
  };
}

function buildLegacyAlpha1Counts(row: Record<string, unknown> | undefined): Application2DatabaseSummaryCounts {
  return {
    fields: Number(row?.["fields"] ?? 0),
    runs: 0,
    deployers: 0,
    assessments: Number(row?.["assessments"] ?? 0),
    responses: Number(row?.["responses"] ?? 0),
    provider_reviews: 0,
    export_specs: 0,
    export_fields: 0,
    mapping_sets: 0,
    mapping_rules: 0,
    export_files: 0,
    validation_errors: 0
  };
}

function buildLatestRun(row: Record<string, unknown> | undefined): Application2DatabaseSummaryRun | null {
  if (!row) return null;

  return {
    run_id: String(row["run_id"]),
    run_name: row["run_name"] == null ? null : String(row["run_name"]),
    seed: row["seed"] == null ? null : Number(row["seed"]),
    target_record_count: Number(row["target_record_count"]),
    started_at: toIsoString(row["started_at"]),
    finished_at: toIsoString(row["finished_at"]),
    status: String(row["status"])
  };
}

function buildLatestExportFile(
  row: Record<string, unknown> | undefined
): Application2DatabaseSummaryExportFile | null {
  if (!row) return null;

  return {
    export_file_id: String(row["export_file_id"]),
    run_id: String(row["run_id"]),
    file_path: String(row["file_path"]),
    record_count: Number(row["record_count"]),
    created_at: toIsoString(row["created_at"])
  };
}

async function loadApplication2DatabaseSummary(
  pool: DbPool,
  schema: DatabaseSchemaDetection
): Promise<Application2DatabaseSummary> {
  const countsResult = await execSql(
    pool,
    `
      SELECT
        (SELECT COUNT(*) FROM dbo.[RUN]) AS runs,
        (SELECT COUNT(*) FROM dbo.DEPLOYER) AS deployers,
        (SELECT COUNT(*) FROM dbo.ASSESSMENT) AS assessments,
        (SELECT COUNT(*) FROM dbo.RESPONSE) AS responses,
        (SELECT COUNT(*) FROM dbo.PROVIDER_REVIEW) AS provider_reviews,
        (SELECT COUNT(*) FROM dbo.EXPORT_SPEC) AS export_specs,
        (SELECT COUNT(*) FROM dbo.EXPORT_FIELD) AS export_fields,
        (SELECT COUNT(*) FROM dbo.MAPPING_SET) AS mapping_sets,
        (SELECT COUNT(*) FROM dbo.MAPPING_RULE) AS mapping_rules,
        (SELECT COUNT(*) FROM dbo.EXPORT_FILE) AS export_files,
        (SELECT COUNT(*) FROM dbo.VALIDATION_ERROR) AS validation_errors
    `
  );
  const latestRunResult = await execSql(
    pool,
    `
      SELECT TOP (1)
        run_id, run_name, seed, target_record_count, started_at, finished_at, status
      FROM dbo.[RUN]
      ORDER BY started_at DESC, run_id DESC
    `
  );
  const latestExportFileResult = await execSql(
    pool,
    `
      SELECT TOP (1)
        export_file_id, run_id, file_path, record_count, created_at
      FROM dbo.EXPORT_FILE
      ORDER BY created_at DESC, export_file_id DESC
    `
  );

  return {
    database: schema.database,
    counts: buildApplication2Counts((countsResult.recordset as Array<Record<string, unknown>>)[0]),
    latest_run: buildLatestRun((latestRunResult.recordset as Array<Record<string, unknown>>)[0]),
    latest_export_file: buildLatestExportFile(
      (latestExportFileResult.recordset as Array<Record<string, unknown>>)[0]
    )
  };
}

async function loadLegacyAlpha1DatabaseSummary(
  pool: DbPool,
  schema: DatabaseSchemaDetection
): Promise<Application2DatabaseSummary> {
  const countsResult = await execSql(
    pool,
    `
      SELECT
        (SELECT COUNT(*) FROM dbo.ASSESSMENT) AS assessments,
        (SELECT COUNT(*) FROM dbo.FIELD) AS fields,
        (SELECT COUNT(*) FROM dbo.RESPONSE) AS responses
    `
  );

  return {
    database: schema.database,
    counts: buildLegacyAlpha1Counts((countsResult.recordset as Array<Record<string, unknown>>)[0]),
    latest_run: null,
    latest_export_file: null
  };
}

export async function loadDatabaseSummary(pool: DbPool): Promise<Application2DatabaseSummary> {
  const schema = await detectSupportedDatabaseSchema(pool);
  if (schema.schema === "legacy_alpha1") {
    return await loadLegacyAlpha1DatabaseSummary(pool, schema);
  }

  return await loadApplication2DatabaseSummary(pool, schema);
}
