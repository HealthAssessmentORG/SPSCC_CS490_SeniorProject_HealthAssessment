import { DbPool, execSql, sql } from "../../db/db_connect";
import { parsePadRule, parseSourceExpression, parseTransformPipeline, ParsedRule } from "./mapping_compile_part_01_parse_rules";

export type ExportField = {
  export_field_id: string;
  field_name: string;
  start_pos: number;
  end_pos: number;
  field_length: number;
  domain_type: string | null;
};

export type RecordContext = {
  assessment: any;
  deployer: any;
  provider_review: any;
  responses: Map<string, string>; // key = `${Q}:${FIELD}`
};

export type WriterFieldPlan = {
  field_name: string;
  start_pos: number;
  length: number;
  domain_type: string | null;
  getValue: (ctx: RecordContext) => string;
};

function toIsoDateIfDate(v: any): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // YYYY-MM-DD
  if (typeof v === "string") {
    // handle ISO datetime strings like 2026-02-13T00:00:00.000Z
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    return v;
  }
  return v == null ? "" : String(v);
}

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
        if (src.kind === "col") {
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
