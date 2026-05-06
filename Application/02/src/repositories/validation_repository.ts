import { randomUUID } from "node:crypto";

import { type DbPool, execSql, sql } from "../db_connect.js";
import type { Application2ValidationErrorRow } from "../validate/rules_engine.js";

export async function insertValidationError(
  pool: DbPool,
  exportFileId: string,
  error: Application2ValidationErrorRow
): Promise<void> {
  await execSql(
    pool,
    `
      INSERT INTO dbo.VALIDATION_ERROR (
        validation_error_id, export_file_id, record_ordinal,
        export_field_name, error_code, expected, actual, message
      )
      VALUES (@id, @fid, @ord, @name, @code, @exp, @act, @msg)
    `,
    {
      id: { type: sql.UniqueIdentifier, value: randomUUID() },
      fid: { type: sql.UniqueIdentifier, value: exportFileId },
      ord: { type: sql.Int, value: error.record_ordinal },
      name: { type: sql.NVarChar(100), value: error.export_field_name },
      code: { type: sql.NVarChar(50), value: error.error_code },
      exp: { type: sql.NVarChar(4000), value: error.expected },
      act: { type: sql.NVarChar(4000), value: error.actual },
      msg: { type: sql.NVarChar(2000), value: error.message }
    }
  );
}

export async function persistValidationErrors(
  pool: DbPool,
  exportFileId: string,
  errors: Application2ValidationErrorRow[]
): Promise<void> {
  for (const error of errors) {
    await insertValidationError(pool, exportFileId, error);
  }
}
