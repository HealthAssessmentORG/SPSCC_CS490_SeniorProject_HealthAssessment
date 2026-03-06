import { DbPool, execSql, sql } from "../../db/db_connect";
import { parsePadRule, parseSourceExpression, parseTransformPipeline, ParsedRule } from "./mapping_compile_part_01_parse_rules";

/**
 * Represents metadata for a single fixed-width export field in a mapping plan.
 *
 * @property export_field_id - Unique identifier for the export field definition.
 * @property field_name - Human-readable name of the field.
 * @property start_pos - Starting character position of the field in the output record.
 * @property end_pos - Ending character position of the field in the output record.
 * @property field_length - Total length of the field, typically derived from its positions.
 * @property domain_type - Optional domain/type classification for the field; `null` when unspecified.
 */
export type ExportField = {
  export_field_id: string;
  field_name: string;
  start_pos: number;
  end_pos: number;
  field_length: number;
  domain_type: string | null;
};

/**
 * Holds all runtime data needed while compiling a writer plan record.
 *
 * @remarks
 * This context object groups source entities and a normalized response lookup
 * so mapping/build steps can resolve values consistently.
 */
export type RecordContext = {
  assessment: any;
  deployer: any;
  provider_review: any;
  responses: Map<string, string>; // key = `${Q}:${FIELD}`
};

/**
 * Describes how a single output field should be written during mapping compilation.
 *
 * A `WriterFieldPlan` defines:
 * - the target field identifier (`field_name`)
 * - where the value should be written (`start_pos`)
 * - the fixed output width (`length`)
 * - an optional domain/category hint (`domain_type`)
 * - a resolver function that computes the field value from a record context (`getValue`)
 *
 * @property field_name - Logical or target name of the field being produced.
 * @property start_pos - Zero-based start position of the field in the output layout.
 * @property length - Fixed character length allocated for this field.
 * @property domain_type - Optional domain/type classification for validation or formatting; `null` when not applicable.
 * @property getValue - Function that derives the field's string value from the provided record context.
 */
export type WriterFieldPlan = {
  field_name: string;
  start_pos: number;
  length: number;
  domain_type: string | null;
  getValue: (ctx: RecordContext) => string;
};

/**
 * Normalizes a value into a date-like string for mapping/output.
 *
 * - If the value is a `Date`, it returns an ISO calendar date (`YYYY-MM-DD`).
 * - If the value is a string that looks like an ISO datetime (starts with `YYYY-MM-DDT`),
 *   it truncates to the date portion (`YYYY-MM-DD`).
 * - If the value is any other string, it is returned unchanged.
 * - If the value is `null` or `undefined`, it returns an empty string.
 * - Otherwise, it converts the value to a string via `String(v)`.
 *
 * @param v - The input value to normalize.
 * @returns A normalized string representation, preferring `YYYY-MM-DD` when possible.
 */
function toIsoDateIfDate(v: any): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // YYYY-MM-DD
  if (typeof v === "string") {
    // handle ISO datetime strings like 2026-02-13T00:00:00.000Z
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    return v;
  }
  return v == null ? "" : String(v);
}

/**
 * Applies a series of transformation operations to a string value.
 * 
 * @param v - The input string to transform
 * @param ops - An array of operation objects that define the transformations to apply.
 *              Each operation should have a `kind` property that specifies the transformation type.
 *              Supported operations:
 *              - `"trim"`: Removes whitespace from both ends of the string
 *              - `"lower"`: Converts the string to lowercase
 *              - `"date_yyyymmdd"`: Converts date strings to YYYYMMDD format.
 *                Handles dates already in YYYYMMDD format (8 digits) or ISO format (YYYY-MM-DD)
 * @returns The transformed string after applying all operations in sequence
 * 
 * @example
 * ```typescript
 * applyTransforms("  Hello World  ", [{ kind: "trim" }, { kind: "lower" }])
 * // returns "hello world"
 * 
 * applyTransforms("2024-01-15", [{ kind: "date_yyyymmdd" }])
 * // returns "20240115"
 * ```
 */
function applyTransforms(v: string, ops: any[]): string {
  let out = v;
  for (const op of ops) {
    if (op.kind === "trim") out = out.trim();
    else if (op.kind === "lower") out = out.toLowerCase();
    else if (op.kind === "date_yyyymmdd") {
      out = out.trim();
      if (/^\d{8}$/.test(out)) {
        // already YYYYMMDD
      } else if (/^\d{4}-\d{2}-\d{2}/.test(out)) {
        out = out.slice(0, 10).replaceAll("-", "");
      }
    }
  }
  return out;
}

/**
 * Normalizes a string to an exact fixed width by truncating or padding.
 *
 * - If `v` is `null`/`undefined`, it is treated as an empty string.
 * - If the value is longer than `length`, it is truncated to `length`.
 * - If shorter than `length`, it is padded:
 *   - with leading zeroes when `pad.kind === "left_zero"`,
 *   - otherwise with trailing spaces.
 *
 * @param v - Input string to normalize.
 * @param length - Target output length.
 * @param pad - Padding configuration object; uses `pad.kind` to choose padding behavior.
 * @returns A string with exactly `length` characters.
 */
function padToLength(v: string, length: number, pad: any): string {
  let out = v ?? "";
  if (out.length > length) out = out.slice(0, length);

  if (out.length < length) {
    const need = length - out.length;
    if (pad.kind === "left_zero") out = "0".repeat(need) + out;
    else out = out + " ".repeat(need); // default right-space
  }
  return out;
}

/**
 * Loads export field definitions for a given export specification, including optional value-domain metadata.
 *
 * Executes a query against `dbo.EXPORT_FIELD` and left-joins `dbo.VALUE_DOMAIN` to retrieve
 * ordered field layout details used for export writer planning.
 *
 * @param pool - Active database connection pool used to execute the query.
 * @param exportSpecId - Unique identifier of the export specification whose fields should be loaded.
 * @returns A promise that resolves to an ordered array of `ExportField` objects with normalized value types.
 */
export async function loadExportFields(pool: DbPool, exportSpecId: string): Promise<ExportField[]> {
  const rs = await execSql(pool, `
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
  `, { sid: { type: sql.UniqueIdentifier, value: exportSpecId } });

  return rs.recordset.map((r: any) => ({
    export_field_id: String(r.export_field_id),
    field_name: String(r.field_name),
    start_pos: Number(r.start_pos),
    end_pos: Number(r.end_pos),
    field_length: Number(r.field_length),
    domain_type: r.domain_type ? String(r.domain_type) : null
  }));
}

/**
 * Loads and parses mapping rules from the database for a specific mapping set.
 * 
 * Retrieves all mapping rules associated with the given mapping set ID and parses
 * their source expressions, transform pipelines, padding rules, and default values
 * into a structured format.
 * 
 * @param pool - The database connection pool used to execute the SQL query
 * @param mappingSetId - The unique identifier of the mapping set to load rules for
 * @returns A Promise that resolves to a Map where keys are export field IDs and 
 *          values are ParsedRule objects containing the parsed rule configuration
 * @throws May throw database connection or query execution errors
 */
export async function loadParsedRules(pool: DbPool, mappingSetId: string): Promise<Map<string, ParsedRule>> {
  const rs = await execSql(pool, `
    SELECT export_field_id, source_expression, transform_pipeline, default_value, pad_rule
    FROM dbo.MAPPING_RULE
    WHERE mapping_set_id = @mid
  `, { mid: { type: sql.UniqueIdentifier, value: mappingSetId } });

  const m = new Map<string, ParsedRule>();
  for (const r of rs.recordset as any[]) {
    const export_field_id = String(r.export_field_id);
    m.set(export_field_id, {
      export_field_id,
      source: parseSourceExpression(String(r.source_expression)),
      transforms: parseTransformPipeline(r.transform_pipeline ? String(r.transform_pipeline) : null),
      pad: parsePadRule(r.pad_rule ? String(r.pad_rule) : null),
      default_value: (r.default_value ?? "") ? String(r.default_value) : ""
    });
  }
  return m;
}

/**
 * Builds a writer plan for fixed-width export fields by pairing each export field
 * with its parsed mapping rule and producing a per-field value resolver.
 *
 * For each field, the generated `getValue` function:
 * - Returns blank space padding when no rule exists for the field.
 * - Resolves a raw value from one of the supported sources:
 *   - constant (`const`)
 *   - table column (`col`) from `ASSESSMENT`, `DEPLOYER`, or `PROVIDER_REVIEW`
 *   - response value keyed by `question_code:field_name`
 * - Applies configured transforms.
 * - Pads/truncates to the field's fixed length according to rule padding settings.
 *
 * @param fields Ordered export field definitions describing name, position, length, and domain type.
 * @param rules Mapping rules keyed by `export_field_id`.
 * @returns An ordered array of writer field plans used to render fixed-width output records.
 */
export function buildWriterPlan(fields: ExportField[], rules: Map<string, ParsedRule>): WriterFieldPlan[] {
  const plan: WriterFieldPlan[] = [];

  for (const f of fields) {
    const rule = rules.get(f.export_field_id);

    plan.push({
      field_name: f.field_name,
      start_pos: f.start_pos,
      length: f.field_length,
      domain_type: f.domain_type,
      getValue: (ctx: RecordContext) => {
        if (!rule) return " ".repeat(f.field_length); // unmapped -> blank
        let raw = rule.default_value;

        const src = rule.source;
        if (src.kind === "const") {
          raw = rule.default_value ?? "";
        } else if (src.kind === "col") {
          if (src.table === "ASSESSMENT") raw = toIsoDateIfDate(ctx.assessment?.[src.column] ?? rule.default_value ?? "");
          else if (src.table === "DEPLOYER") raw = toIsoDateIfDate(ctx.deployer?.[src.column] ?? rule.default_value ?? "");
          else raw = toIsoDateIfDate(ctx.provider_review?.[src.column] ?? rule.default_value ?? "");
        } else {
          const key = `${src.question_code}:${src.field_name}`;
          raw = String(ctx.responses.get(key) ?? rule.default_value ?? "");
        }

        raw = applyTransforms(raw, rule.transforms);
        raw = padToLength(raw, f.field_length, rule.pad);
        return raw;
      }
    });
  }

  return plan;
}
