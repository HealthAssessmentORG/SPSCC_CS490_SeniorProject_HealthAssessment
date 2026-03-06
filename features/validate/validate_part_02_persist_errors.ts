import { DbPool, execSql, sql } from "../../db/db_connect";
import { ValidationErrorRow } from "./validate_part_01_rules_engine";

import { randomUUID } from "node:crypto";

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
    await execSql(pool, `
      INSERT INTO dbo.VALIDATION_ERROR (
        validation_error_id, export_file_id, record_ordinal,
        export_field_name, error_code, expected, actual, message
      )
      VALUES (@id, @fid, @ord, @name, @code, @exp, @act, @msg)
    `, {
      id: { type: sql.UniqueIdentifier, value: randomUUID() },
      fid: { type: sql.UniqueIdentifier, value: export_file_id },
      ord: { type: sql.Int, value: e.record_ordinal },
      name: { type: sql.NVarChar(100), value: e.export_field_name },
      code: { type: sql.NVarChar(50), value: e.error_code },
      exp: { type: sql.NVarChar(4000), value: e.expected },
      act: { type: sql.NVarChar(4000), value: e.actual },
      msg: { type: sql.NVarChar(2000), value: e.message }
    });
  }
}
