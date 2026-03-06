import { DbPool, execSql, sql } from "../../db/db_connect";
import { ExportSpecModel, ExportFieldRow } from "./spec_import_part_01_read_xlsx";
import { randomUUID } from "node:crypto";
import { classifyValuesSpec } from "./spec_values_part_01_utils";

/**
 * Represents a guess for a domain with its type and specification details.
 * @typedef {Object} DomainGuess
 * @property {string} domain_type - The type of the domain being guessed.
 * @property {string} raw_spec - The raw specification or definition of the domain.
 * @property {Array<{code: string; meaning: string}>} [enum_pairs] - Optional array of code-meaning pairs for enumerated domains.
 */
type DomainGuess = {
  domain_type: string;
  raw_spec: string;
  enum_pairs?: Array<{ code: string; meaning: string }>;
};

/**
 * Guesses the domain type and specification for an export field based on its values.
 * 
 * @param f - The export field row containing the field name and raw values specification
 * @returns A domain guess object containing the determined domain type, raw specification,
 *          and optional enum pairs if the domain is an enumeration type
 * 
 * @remarks
 * The function classifies the field values and maps them to domain types in the following order:
 * - TEXT: Plain text fields
 * - DATE_YYYYMMDD: Dates in YYYYMMDD format
 * - DODID10: Department of Defense ID format
 * - ENUM_YN: Yes/No enumeration
 * - ENUM: General enumeration with multiple values
 * - SPEC_RAW: Default fallback for unclassified specifications
 */
function guessDomain(f: ExportFieldRow): DomainGuess {
  const spec = classifyValuesSpec(f.field_name, f.values_spec_raw);

  if (spec.kind === "text") {
    return { domain_type: "TEXT", raw_spec: spec.raw };
  }
  if (spec.kind === "date_yyyymmdd") {
    return { domain_type: "DATE_YYYYMMDD", raw_spec: spec.raw };
  }
  if (spec.kind === "dodid10") {
    return { domain_type: "DODID10", raw_spec: spec.raw };
  }
  if (spec.kind === "enum_yn") {
    return {
      domain_type: "ENUM_YN",
      raw_spec: spec.raw,
      enum_pairs: spec.enum_pairs
    };
  }
  if (spec.kind === "enum") {
    return {
      domain_type: "ENUM",
      raw_spec: spec.raw,
      enum_pairs: spec.enum_pairs
    };
  }

  return { domain_type: "SPEC_RAW", raw_spec: spec.raw };
}

/**
 * Upserts an export specification into the database.
 * 
 * If a specification with the same name and version already exists, updates its row length.
 * Otherwise, creates a new specification with a generated UUID.
 * 
 * @param pool - The database connection pool
 * @param spec - The export specification model containing spec_name, spec_version, and row_length
 * @returns A promise that resolves to the export_spec_id (either existing or newly created)
 * @throws Will throw an error if the database operation fails
 */
export async function upsertExportSpec(pool: DbPool, spec: ExportSpecModel): Promise<string> {
  const found = await execSql(
    pool,
    `
    SELECT TOP (1) export_spec_id
    FROM dbo.EXPORT_SPEC
    WHERE spec_name = @name AND spec_version = @ver
  `,
    {
      name: { type: sql.NVarChar(200), value: spec.spec_name },
      ver: { type: sql.NVarChar(50), value: spec.spec_version }
    }
  );

  if (found.recordset.length) {
    const id = String(found.recordset[0].export_spec_id);
    await execSql(
      pool,
      `
      UPDATE dbo.EXPORT_SPEC
      SET row_length = @rowlen
      WHERE export_spec_id = @id
    `,
      {
        rowlen: { type: sql.Int, value: spec.row_length },
        id: { type: sql.UniqueIdentifier, value: id }
      }
    );
    return id;
  }

  const id = randomUUID();
  await execSql(
    pool,
    `
    INSERT INTO dbo.EXPORT_SPEC (export_spec_id, spec_name, spec_version, row_length)
    VALUES (@id, @name, @ver, @rowlen)
  `,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      name: { type: sql.NVarChar(200), value: spec.spec_name },
      ver: { type: sql.NVarChar(50), value: spec.spec_version },
      rowlen: { type: sql.Int, value: spec.row_length }
    }
  );

  return id;
}

/**
 * Upserts a domain into the VALUE_DOMAIN table.
 * 
 * Attempts to find an existing domain matching the specified type and raw specification.
 * If found, returns the existing domain ID. If not found, creates a new domain with a
 * generated UUID and returns the newly created ID.
 * 
 * @param pool - The database connection pool
 * @param d - The domain guess object containing domain_type and raw_spec
 * @returns A promise that resolves to the domain_id as a string
 */
async function upsertDomain(pool: DbPool, d: DomainGuess): Promise<string> {
  const found = await execSql(
    pool,
    `
    SELECT TOP (1) domain_id
    FROM dbo.VALUE_DOMAIN
    WHERE domain_type = @t AND raw_spec = @r
  `,
    {
      t: { type: sql.NVarChar(50), value: d.domain_type },
      r: { type: sql.NVarChar(4000), value: d.raw_spec }
    }
  );

  if (found.recordset.length) return String(found.recordset[0].domain_id);

  const id = randomUUID();
  await execSql(
    pool,
    `
    INSERT INTO dbo.VALUE_DOMAIN (domain_id, domain_type, raw_spec)
    VALUES (@id, @t, @r)
  `,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      t: { type: sql.NVarChar(50), value: d.domain_type },
      r: { type: sql.NVarChar(4000), value: d.raw_spec }
    }
  );

  return id;
}

/**
 * Upserts enum values for a specified domain into the database.
 * 
 * Iterates through an array of code-meaning pairs and inserts each pair
 * into the DOMAIN_ENUM_VALUE table if a record with the same domain_id
 * and code does not already exist.
 * 
 * @param pool - The database connection pool
 * @param domainId - The unique identifier of the domain
 * @param pairs - An array of objects containing code and meaning properties to upsert
 * @returns A promise that resolves when all enum values have been processed
 */
async function upsertEnumValues(
  pool: DbPool,
  domainId: string,
  pairs: Array<{ code: string; meaning: string }>
) {
  for (const p of pairs) {
    await execSql(
      pool,
      `
      IF NOT EXISTS (
        SELECT 1 FROM dbo.DOMAIN_ENUM_VALUE WHERE domain_id = @did AND code = @code
      )
      INSERT INTO dbo.DOMAIN_ENUM_VALUE (domain_enum_value_id, domain_id, code, meaning)
      VALUES (@id, @did, @code, @meaning)
    `,
      {
        id: { type: sql.UniqueIdentifier, value: randomUUID() },
        did: { type: sql.UniqueIdentifier, value: domainId },
        code: { type: sql.NVarChar(50), value: p.code },
        meaning: { type: sql.NVarChar(200), value: p.meaning }
      }
    );
  }
}

/**
 * Replaces all export fields for a given export specification.
 * 
 * This function performs a complete replacement of export fields by:
 * 1. Deleting all mapping rules associated with the export spec (via mapping sets)
 * 2. Deleting any remaining mapping rules linked to export fields (redundant safety check)
 * 3. Deleting all existing export fields for the spec
 * 4. Inserting new export fields with their associated domains and enum values
 * 
 * @remarks
 * The deletion order is critical due to the FK_MAPPING_RULE_FIELD foreign key constraint
 * being set to NO ACTION. This prevents SQL Server from automatically cascading deletes,
 * so dependent MAPPING_RULE records must be explicitly deleted before EXPORT_FIELD records.
 * 
 * @param pool - The database connection pool
 * @param exportSpecId - The UUID of the export specification to update
 * @param fields - Array of export field definitions to insert
 * @returns A promise that resolves when the operation completes
 * @throws {Error} If any database operation fails
 */
export async function replaceExportFields(pool: DbPool, exportSpecId: string, fields: ExportFieldRow[]) {
  // IMPORTANT:
  // FK_MAPPING_RULE_FIELD is NO ACTION (to avoid multiple cascade paths).
  // Therefore we must delete dependent MAPPING_RULE rows before deleting EXPORT_FIELD rows.

  // 1) Delete mapping rules via mapping-set (covers rules for the spec regardless of field IDs)
  await execSql(
    pool,
    `
    DELETE mr
    FROM dbo.MAPPING_RULE mr
    JOIN dbo.MAPPING_SET ms ON ms.mapping_set_id = mr.mapping_set_id
    WHERE ms.export_spec_id = @sid;
  `,
    { sid: { type: sql.UniqueIdentifier, value: exportSpecId } }
  );

  // 2) Also delete mapping rules via export-field join (belt + suspenders)
  await execSql(
    pool,
    `
    DELETE mr
    FROM dbo.MAPPING_RULE mr
    WHERE mr.export_field_id IN (
      SELECT ef.export_field_id
      FROM dbo.EXPORT_FIELD ef
      WHERE ef.export_spec_id = @sid
    );
  `,
    { sid: { type: sql.UniqueIdentifier, value: exportSpecId } }
  );

  // 3) Now it is safe to replace export fields for this spec
  await execSql(pool, `DELETE FROM dbo.EXPORT_FIELD WHERE export_spec_id = @sid`, {
    sid: { type: sql.UniqueIdentifier, value: exportSpecId }
  });

  // Insert the new set
  for (const f of fields) {
    const dom = guessDomain(f);
    const domainId = await upsertDomain(pool, dom);
    if (dom.enum_pairs) await upsertEnumValues(pool, domainId, dom.enum_pairs);

    await execSql(
      pool,
      `
      INSERT INTO dbo.EXPORT_FIELD (
        export_field_id, export_spec_id, domain_id, field_order, question_code, field_name,
        start_pos, end_pos, description, values_spec_raw
      )
      VALUES (
        @id, @sid, @did, @ord, @q, @name,
        @sp, @ep, @desc, @raw
      )
    `,
      {
        id: { type: sql.UniqueIdentifier, value: randomUUID() },
        sid: { type: sql.UniqueIdentifier, value: exportSpecId },
        did: { type: sql.UniqueIdentifier, value: domainId },
        ord: { type: sql.Int, value: f.order },
        q: { type: sql.NVarChar(50), value: f.question_code ?? null },
        name: { type: sql.NVarChar(100), value: f.field_name },
        sp: { type: sql.Int, value: f.start_pos },
        ep: { type: sql.Int, value: f.end_pos },
        desc: { type: sql.NVarChar(1000), value: f.description ?? null },
        raw: { type: sql.NVarChar(4000), value: f.values_spec_raw ?? null }
      }
    );
  }
}

/**
 * Imports a specification to the database by upserting the export spec and replacing its fields.
 * @param pool - The database connection pool
 * @param spec - The specification model to import
 * @returns A promise that resolves to the ID of the upserted export specification
 */
export async function importSpecToDb(pool: DbPool, spec: ExportSpecModel): Promise<string> {
  const exportSpecId = await upsertExportSpec(pool, spec);
  await replaceExportFields(pool, exportSpecId, spec.fields);
  return exportSpecId;
}
