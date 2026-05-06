import { type DbPool } from "../../db/db_connect.js";
import type { ValidationErrorRow } from "./validate_part_01_rules_engine.js";
import { insertValidationError } from "./validate_part_03_repository.js";

/**
 * Persists validation error records for a specific export file into `dbo.VALIDATION_ERROR`.
 *
 * Iterates through each provided error row and performs an `INSERT` with a newly generated
 * `validation_error_id` for each record.
 *
 * @param pool - Active database connection pool used to execute insert statements.
 * @param export_file_id - Unique identifier of the export file associated with the validation errors.
 * @param errs - Collection of validation error rows to persist.
 * @returns A promise that resolves when all error rows have been inserted.
 *
 * @throws Propagates any database or execution error encountered while inserting records.
 */
export async function persistValidationErrors(
  pool: DbPool,
  export_file_id: string,
  errs: ValidationErrorRow[]
) {
  for (const e of errs) {
    await insertValidationError(pool, export_file_id, e);
  }
}
