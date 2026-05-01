import { randomUUID } from "node:crypto";

import { type DbPool, execSql, sql } from "../../db/db_connect";
import type { RecordContext } from "../mapping/mapping_compile_part_02_build_writer_plan";

export type ExportFileInsert = {
  runId: string;
  mappingSetId: string;
  filePath: string;
  recordCount: number;
};

export async function createExportFile(pool: DbPool, row: ExportFileInsert): Promise<string> {
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

export async function loadExportRecordContext(pool: DbPool, assessmentId: string): Promise<RecordContext> {
  const aRow = (
    await execSql(pool, "SELECT * FROM dbo.ASSESSMENT WHERE assessment_id=@id", {
      id: { type: sql.UniqueIdentifier, value: assessmentId }
    })
  ).recordset[0];

  const dRow = (
    await execSql(
      pool,
      `
        SELECT d.* FROM dbo.DEPLOYER d
        JOIN dbo.ASSESSMENT a ON a.deployer_id = d.deployer_id
        WHERE a.assessment_id = @id
      `,
      { id: { type: sql.UniqueIdentifier, value: assessmentId } }
    )
  ).recordset[0];

  const prRow = (
    await execSql(pool, "SELECT * FROM dbo.PROVIDER_REVIEW WHERE assessment_id=@id", {
      id: { type: sql.UniqueIdentifier, value: assessmentId }
    })
  ).recordset[0];

  const respRows = await execSql(
    pool,
    `
      SELECT question_code, field_name, value_norm
      FROM dbo.RESPONSE
      WHERE assessment_id = @id
    `,
    { id: { type: sql.UniqueIdentifier, value: assessmentId } }
  );

  const respMap = new Map<string, string>();
  for (const r of respRows.recordset as any[]) {
    respMap.set(`${r.question_code}:${r.field_name}`, String(r.value_norm ?? ""));
  }

  return {
    assessment: aRow,
    deployer: dRow,
    provider_review: prRow,
    responses: respMap
  };
}
