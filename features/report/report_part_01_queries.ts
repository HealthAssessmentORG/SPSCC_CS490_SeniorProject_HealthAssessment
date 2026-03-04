import { DbPool, execSql, sql } from "../../db/db_connect";

/**
 * Retrieves summary metadata for a single run from `dbo.[RUN]` by its unique identifier.
 *
 * Executes a parameterized query using `@id` to safely fetch:
 * `run_id`, `run_name`, `seed`, `target_record_count`, `started_at`, `finished_at`, and `status`.
 *
 * @param pool - The database connection pool used to execute the query.
 * @param runId - The unique identifier of the run to retrieve.
 * @returns A promise that resolves to the first matching run summary record, or `null` if no run is found.
 */
export async function getRunSummary(pool: DbPool, runId: string) {
  const rs = await execSql(pool, `
    SELECT run_id, run_name, seed, target_record_count, started_at, finished_at, status
    FROM dbo.[RUN]
    WHERE run_id = @id
  `, { id: { type: sql.UniqueIdentifier, value: runId } });

  return rs.recordset[0] ?? null;
}

/**
 * Retrieves aggregated counts of validation errors for a specific export file.
 *
 * Executes a grouped query against `dbo.VALIDATION_ERROR` to count occurrences
 * of each `error_code` associated with the provided export file ID, ordered by
 * highest count first.
 *
 * @param pool - Database connection pool used to execute the query.
 * @param exportFileId - Unique identifier of the export file whose validation errors are counted.
 * @returns A promise that resolves to the query recordset containing objects with:
 * - `error_code`: the validation error code
 * - `cnt`: the number of occurrences for that error code
 */
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
