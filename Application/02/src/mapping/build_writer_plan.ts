import type {
  Application2ExportFieldRow,
  Application2RawMappingRuleRow,
  Application2RecordContext
} from "../types.js";
import {
  parsePadRule,
  parseSourceExpression,
  parseTransformPipeline,
  type PadRule,
  type ParsedRule,
  type TransformOp
} from "./parse_rules.js";

export type Application2WriterFieldPlan = {
  field_name: string;
  start_pos: number;
  length: number;
  domain_type: string | null;
  getValue: (ctx: Application2RecordContext) => string;
};

function toIsoDateIfDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    return v;
  }
  return v == null ? "" : String(v);
}

function applyTransforms(v: string, ops: TransformOp[]): string {
  let out = v;
  for (const op of ops) {
    if (op.kind === "trim") out = out.trim();
    else if (op.kind === "lower") out = out.toLowerCase();
    else if (op.kind === "date_yyyymmdd") {
      out = out.trim();
      if (/^\d{8}$/.test(out)) {
        // Already YYYYMMDD.
      } else if (/^\d{4}-\d{2}-\d{2}/.test(out)) {
        out = out.slice(0, 10).replaceAll("-", "");
      }
    }
  }
  return out;
}

function padToLength(v: string, length: number, pad: PadRule): string {
  let out = v ?? "";
  if (out.length > length) out = out.slice(0, length);

  if (out.length < length) {
    const need = length - out.length;
    if (pad.kind === "left_zero") out = "0".repeat(need) + out;
    else out = out + " ".repeat(need);
  }
  return out;
}

export function buildParsedRuleMap(rawRules: Application2RawMappingRuleRow[]): Map<string, ParsedRule> {
  const rules = new Map<string, ParsedRule>();

  for (const row of rawRules) {
    rules.set(row.export_field_id, {
      export_field_id: row.export_field_id,
      source: parseSourceExpression(row.source_expression),
      transforms: parseTransformPipeline(row.transform_pipeline),
      pad: parsePadRule(row.pad_rule),
      default_value: (row.default_value ?? "") ? String(row.default_value) : ""
    });
  }

  return rules;
}

export function buildWriterPlan(
  fields: Application2ExportFieldRow[],
  rules: Map<string, ParsedRule>
): Application2WriterFieldPlan[] {
  const plan: Application2WriterFieldPlan[] = [];

  for (const field of fields) {
    const rule = rules.get(field.export_field_id);

    plan.push({
      field_name: field.field_name,
      start_pos: field.start_pos,
      length: field.field_length,
      domain_type: field.domain_type,
      getValue: (ctx: Application2RecordContext) => {
        if (!rule) return " ".repeat(field.field_length);
        let raw = rule.default_value;

        const src = rule.source;
        if (src.kind === "const") {
          raw = rule.default_value ?? "";
        } else if (src.kind === "col") {
          if (src.table === "ASSESSMENT") {
            raw = toIsoDateIfDate(ctx.assessment?.[src.column] ?? rule.default_value ?? "");
          } else if (src.table === "DEPLOYER") {
            raw = toIsoDateIfDate(ctx.deployer?.[src.column] ?? rule.default_value ?? "");
          } else {
            raw = toIsoDateIfDate(ctx.provider_review?.[src.column] ?? rule.default_value ?? "");
          }
        } else {
          const key = `${src.question_code}:${src.field_name}`;
          raw = String(ctx.responses.get(key) ?? rule.default_value ?? "");
        }

        raw = applyTransforms(raw, rule.transforms);
        raw = padToLength(raw, field.field_length, rule.pad);
        return raw;
      }
    });
  }

  return plan;
}
