import { randomUUID } from "node:crypto";

import { type DbPool, execSql, sql } from "../db_connect";
import type { Application2ExportFileInsert } from "../types";

export async function createExportFile(pool: DbPool, row: Application2ExportFileInsert): Promise<string> {
  const exportFileId = randomUUID();

  await execSql(
    pool,
    `
      INSERT INTO dbo.EXPORT_FILE (export_file_id, run_id, mapping_set_id, file_path, record_count)
      VALUES (@id, @rid, @mid, @p, @cnt)
    `,
    {
      id: { type: sql.UniqueIdentifier, value: exportFileId },
      rid: { type: sql.UniqueIdentifier, value: row.runId },
      mid: { type: sql.UniqueIdentifier, value: row.mappingSetId },
      p: { type: sql.NVarChar(1024), value: row.filePath },
      cnt: { type: sql.Int, value: row.recordCount }
    }
  );

  return exportFileId;
}
