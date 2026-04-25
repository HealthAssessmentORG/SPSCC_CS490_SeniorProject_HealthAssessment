import { type DbPool, execSql, sql } from "../db_connect";
import type {
  Application2ExportFieldRow,
  Application2ExportSpecLayout,
  Application2RawMappingRuleRow
} from "../types";

export async function loadExportSpecLayout(
  pool: DbPool,
  exportSpecId: string
): Promise<Application2ExportSpecLayout> {
  const result = await execSql(
    pool,
    `
      SELECT export_spec_id, row_length
      FROM dbo.EXPORT_SPEC
      WHERE export_spec_id = @sid
    `,
    { sid: { type: sql.UniqueIdentifier, value: exportSpecId } }
  );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(`Export spec not found: ${exportSpecId}`);
  }

  return {
    export_spec_id: String(row.export_spec_id),
    row_length: Number(row.row_length)
  };
}

export async function loadExportFields(
  pool: DbPool,
  exportSpecId: string
): Promise<Application2ExportFieldRow[]> {
  const result = await execSql(
    pool,
    `
      SELECT
        ef.export_field_id,
        ef.field_name,
        ef.start_pos,
        ef.end_pos,
        ef.field_length,
        vd.domain_type
      FROM dbo.EXPORT_FIELD ef
      LEFT JOIN dbo.VALUE_DOMAIN vd ON vd.domain_id = ef.domain_id
      WHERE ef.export_spec_id = @sid
      ORDER BY ef.field_order
    `,
    { sid: { type: sql.UniqueIdentifier, value: exportSpecId } }
  );

  return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
    export_field_id: String(row.export_field_id),
    field_name: String(row.field_name),
    start_pos: Number(row.start_pos),
    end_pos: Number(row.end_pos),
    field_length: Number(row.field_length),
    domain_type: row.domain_type == null ? null : String(row.domain_type)
  }));
}

export async function loadRawMappingRules(
  pool: DbPool,
  mappingSetId: string
): Promise<Application2RawMappingRuleRow[]> {
  const result = await execSql(
    pool,
    `
      SELECT export_field_id, source_expression, transform_pipeline, default_value, pad_rule
      FROM dbo.MAPPING_RULE
      WHERE mapping_set_id = @mid
    `,
    { mid: { type: sql.UniqueIdentifier, value: mappingSetId } }
  );

  return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
    export_field_id: String(row.export_field_id),
    source_expression: String(row.source_expression),
    transform_pipeline: row.transform_pipeline == null ? null : String(row.transform_pipeline),
    default_value: row.default_value == null ? null : String(row.default_value),
    pad_rule: row.pad_rule == null ? null : String(row.pad_rule)
  }));
}
