import { type DbPool, execSql } from "../db_connect.js";
import type {
  Application2DatabaseFormSummary,
  Application2DatabaseFormSummaryField,
  Application2DatabaseFormSummaryForm
} from "../types.js";

type FormSpecRow = {
  export_spec_id: unknown;
  spec_name: unknown;
  spec_version: unknown;
};

type FormFieldRow = {
  export_spec_id: unknown;
  export_field_id: unknown;
  field_order: unknown;
  question_code: unknown;
  field_name: unknown;
  start_pos: unknown;
  end_pos: unknown;
  field_length: unknown;
};

type MappingSetRow = {
  export_spec_id: unknown;
  mapping_set_id: unknown;
};

function buildFormName(specName: string, specVersion: string): string {
  return `${specName} ${specVersion}`;
}

function buildField(row: FormFieldRow): Application2DatabaseFormSummaryField {
  return {
    field_name: String(row.field_name),
    field_uuid: String(row.export_field_id),
    field_order: Number(row.field_order),
    question_code: row.question_code == null ? null : String(row.question_code),
    start_pos: Number(row.start_pos),
    end_pos: Number(row.end_pos),
    field_length: Number(row.field_length)
  };
}

function groupFields(rows: FormFieldRow[]): Map<string, Application2DatabaseFormSummaryField[]> {
  const grouped = new Map<string, Application2DatabaseFormSummaryField[]>();

  for (const row of rows) {
    const exportSpecId = String(row.export_spec_id);
    const fields = grouped.get(exportSpecId) ?? [];
    fields.push(buildField(row));
    grouped.set(exportSpecId, fields);
  }

  return grouped;
}

function groupMappingSetIds(rows: MappingSetRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const exportSpecId = String(row.export_spec_id);
    const mappingSetIds = grouped.get(exportSpecId) ?? [];
    mappingSetIds.push(String(row.mapping_set_id));
    grouped.set(exportSpecId, mappingSetIds);
  }

  return grouped;
}

function buildForms(
  specs: FormSpecRow[],
  fieldsBySpec: Map<string, Application2DatabaseFormSummaryField[]>,
  mappingSetIdsBySpec: Map<string, string[]>
): Application2DatabaseFormSummaryForm[] {
  return specs.map((row) => {
    const exportSpecId = String(row.export_spec_id);
    const specName = String(row.spec_name);
    const specVersion = String(row.spec_version);

    return {
      form_name: buildFormName(specName, specVersion),
      spec_name: specName,
      spec_version: specVersion,
      uuids: {
        export_spec_id: exportSpecId,
        mapping_set_ids: mappingSetIdsBySpec.get(exportSpecId) ?? []
      },
      fields: fieldsBySpec.get(exportSpecId) ?? []
    };
  });
}

export async function loadDatabaseFormSummary(pool: DbPool): Promise<Application2DatabaseFormSummary> {
  const dbResult = await execSql(pool, "SELECT DB_NAME() AS database_name");
  const specsResult = await execSql(
    pool,
    `
      SELECT export_spec_id, spec_name, spec_version
      FROM dbo.EXPORT_SPEC
      ORDER BY spec_name, spec_version, export_spec_id
    `
  );
  const fieldsResult = await execSql(
    pool,
    `
      SELECT
        export_spec_id,
        export_field_id,
        field_order,
        question_code,
        field_name,
        start_pos,
        end_pos,
        field_length
      FROM dbo.EXPORT_FIELD
      ORDER BY export_spec_id, field_order, field_name, export_field_id
    `
  );
  const mappingSetsResult = await execSql(
    pool,
    `
      SELECT export_spec_id, mapping_set_id
      FROM dbo.MAPPING_SET
      ORDER BY export_spec_id, mapping_set_id
    `
  );

  const specs = specsResult.recordset as FormSpecRow[];
  const fields = fieldsResult.recordset as FormFieldRow[];
  const mappingSets = mappingSetsResult.recordset as MappingSetRow[];

  return {
    database: String((dbResult.recordset as Array<{ database_name: unknown }>)[0]?.database_name ?? ""),
    forms: buildForms(specs, groupFields(fields), groupMappingSetIds(mappingSets))
  };
}
