import { randomUUID } from "node:crypto";

import { DbPool, execSql, sql } from "../../db/db_connect";
import { Rng } from "../generator/generator_part_01_rng";
import { classifyValuesSpec, extractLiteralConstant } from "../spec_import/spec_values_part_01_utils";

export type MappingProfile = "spec" | "prealpha";

export type MappingSourceCounts = {
  COL: number;
  RESP: number;
  CONST: number;
};

export type MappingSeedStats = {
  mapping_set_id: string;
  source_counts: MappingSourceCounts;
  literal_field_count: number;
  placeholder_field_count: number;
  rule_count: number;
};

export type SpecResponseField = {
  question_code: string;
  field_name: string;
  field_length: number;
  domain_type: string | null;
  values_spec_raw: string | null;
};

export type MappingProfileBuildResult = MappingSeedStats & {
  form_type_observed: string;
  form_version_observed: string;
  spec_response_fields: SpecResponseField[];
};

export type MappingRulePreview = {
  source_expression: string;
  transform_pipeline: string;
  default_value: string;
  pad_rule: string;
  is_literal: boolean;
  is_placeholder: boolean;
};

export type ExportFieldMappingPreviewInput = {
  field_name: string;
  question_code: string | null;
  field_length: number;
  values_spec_raw: string | null;
  domain_type: string | null;
};

type ExportFieldSeedRow = {
  export_field_id: string;
  field_name: string;
  question_code: string | null;
  field_length: number;
  values_spec_raw: string | null;
  domain_type: string | null;
};

type MappingRuleSeed = {
  export_field_id: string;
  source_expression: string;
  transform_pipeline: string;
  default_value: string;
  pad_rule: string;
  is_literal: boolean;
  is_placeholder: boolean;
};

const LEGACY_FORM_TYPE = "PRE";
const LEGACY_FORM_VERSION = "DD2795_202006";

const PREALPHA_RULES: Record<string, { src: string; xform: string; pad: string }> = {
  FORM_TYPE: { src: "COL:ASSESSMENT.form_type_observed", xform: "trim", pad: "pad:right:space" },
  FORM_VERSION: { src: "COL:ASSESSMENT.form_version_observed", xform: "trim", pad: "pad:right:space" },
  DODID: { src: "COL:DEPLOYER.dod_id", xform: "trim", pad: "pad:right:space" },
  D_EVENT: { src: "COL:ASSESSMENT.event_date", xform: "date:yyyymmdd", pad: "pad:right:space" },
  LNAME: { src: "RESP:DEM:LNAME", xform: "trim", pad: "pad:right:space" },
  FNAME: { src: "RESP:DEM:FNAME", xform: "trim", pad: "pad:right:space" },
  MI: { src: "RESP:DEM:MI", xform: "trim", pad: "pad:right:space" },
  DOB: { src: "RESP:DEM:DOB", xform: "trim", pad: "pad:right:space" },
  SEX: { src: "RESP:DEM:SEX", xform: "trim", pad: "pad:right:space" },
  FORM_SERVICE: { src: "RESP:DEM:FORM_SERVICE", xform: "trim", pad: "pad:right:space" },
  FORM_COMPONENT: { src: "RESP:DEM:FORM_COMPONENT", xform: "trim", pad: "pad:right:space" },
  GRADE: { src: "RESP:DEM:GRADE", xform: "trim", pad: "pad:right:space" },
  UNIT_NAME: { src: "RESP:DEM:UNIT_NAME", xform: "trim", pad: "pad:right:space" },
  UNIT_LOC: { src: "RESP:DEM:UNIT_LOC", xform: "trim", pad: "pad:right:space" },
  EMAIL: { src: "RESP:DEM:EMAIL", xform: "trim|lower", pad: "pad:right:space" },
  TRICARE: { src: "RESP:HP16:TRICARE", xform: "trim", pad: "pad:right:space" },
  PROVIDER_NAME: { src: "COL:PROVIDER_REVIEW.provider_name", xform: "trim", pad: "pad:right:space" },
  CERTIFY_DATE: { src: "COL:PROVIDER_REVIEW.certify_date", xform: "date:yyyymmdd", pad: "pad:right:space" },
  PROVIDER_TITLE: { src: "COL:PROVIDER_REVIEW.provider_title", xform: "trim", pad: "pad:right:space" },
  CERT_PROVIDER: { src: "COL:PROVIDER_REVIEW.provider_signature", xform: "trim", pad: "pad:right:space" }
};

const SPEC_COLUMN_RULES: Record<string, string> = {
  DODID: "COL:DEPLOYER.dod_id",
  D_EVENT: "COL:ASSESSMENT.event_date",
  PROVIDER_NAME: "COL:PROVIDER_REVIEW.provider_name",
  CERTIFY_DATE: "COL:PROVIDER_REVIEW.certify_date",
  PROVIDER_TITLE: "COL:PROVIDER_REVIEW.provider_title",
  CERT_PROVIDER: "COL:PROVIDER_REVIEW.provider_signature"
};

function hashString32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function placeholderDefaultForField(r: ExportFieldSeedRow): string {
  const analysis = classifyValuesSpec(r.field_name, r.values_spec_raw);

  if ((analysis.kind === "enum" || analysis.kind === "enum_yn") && analysis.enum_pairs && analysis.enum_pairs.length) {
    return analysis.enum_pairs[0].code;
  }
  if (analysis.kind === "date_yyyymmdd") return "20000101";
  if (analysis.kind === "dodid10") return "0000000000";
  if (r.field_name.trim().toUpperCase().includes("EMAIL")) return "unknown@example.mil";

  const rng = new Rng(hashString32(`${r.field_name}|${analysis.raw}`) || 1);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = Math.max(1, Math.min(r.field_length, 12));
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[rng.int(0, alphabet.length - 1)];
  return out;
}

function transformForField(r: ExportFieldSeedRow): string {
  const name = r.field_name.trim().toUpperCase();
  if (name.includes("EMAIL")) return "trim|lower";

  const analysis = classifyValuesSpec(r.field_name, r.values_spec_raw);
  if (r.domain_type === "DATE_YYYYMMDD" || analysis.kind === "date_yyyymmdd") {
    return "date:yyyymmdd";
  }
  return "trim";
}

function buildPrealphaRule(r: ExportFieldSeedRow): MappingRuleSeed | null {
  const key = r.field_name.trim().toUpperCase();
  const wanted = PREALPHA_RULES[key];
  if (!wanted) return null;

  return {
    export_field_id: r.export_field_id,
    source_expression: wanted.src,
    transform_pipeline: wanted.xform,
    default_value: "",
    pad_rule: wanted.pad,
    is_literal: false,
    is_placeholder: false
  };
}

function buildSpecRule(r: ExportFieldSeedRow): MappingRuleSeed {
  const key = r.field_name.trim().toUpperCase();
  const literal = extractLiteralConstant(r.values_spec_raw);
  const transform_pipeline = transformForField(r);

  if (key === "FORM_TYPE") {
    if (literal) {
      return {
        export_field_id: r.export_field_id,
        source_expression: "CONST",
        transform_pipeline,
        default_value: literal,
        pad_rule: "pad:right:space",
        is_literal: true,
        is_placeholder: false
      };
    }
    return {
      export_field_id: r.export_field_id,
      source_expression: "COL:ASSESSMENT.form_type_observed",
      transform_pipeline,
      default_value: "",
      pad_rule: "pad:right:space",
      is_literal: false,
      is_placeholder: false
    };
  }

  if (key === "FORM_VERSION") {
    if (literal) {
      return {
        export_field_id: r.export_field_id,
        source_expression: "CONST",
        transform_pipeline,
        default_value: literal,
        pad_rule: "pad:right:space",
        is_literal: true,
        is_placeholder: false
      };
    }
    return {
      export_field_id: r.export_field_id,
      source_expression: "COL:ASSESSMENT.form_version_observed",
      transform_pipeline,
      default_value: "",
      pad_rule: "pad:right:space",
      is_literal: false,
      is_placeholder: false
    };
  }

  const colSource = SPEC_COLUMN_RULES[key];
  if (colSource) {
    return {
      export_field_id: r.export_field_id,
      source_expression: colSource,
      transform_pipeline,
      default_value: placeholderDefaultForField(r),
      pad_rule: "pad:right:space",
      is_literal: false,
      is_placeholder: false
    };
  }

  const questionCode = (r.question_code ?? "").trim();
  if (questionCode) {
    return {
      export_field_id: r.export_field_id,
      source_expression: `RESP:${questionCode}:${r.field_name}`,
      transform_pipeline,
      default_value: placeholderDefaultForField(r),
      pad_rule: "pad:right:space",
      is_literal: false,
      is_placeholder: false
    };
  }

  if (literal) {
    return {
      export_field_id: r.export_field_id,
      source_expression: "CONST",
      transform_pipeline,
      default_value: literal,
      pad_rule: "pad:right:space",
      is_literal: true,
      is_placeholder: false
    };
  }

  return {
    export_field_id: r.export_field_id,
    source_expression: "CONST",
    transform_pipeline,
    default_value: placeholderDefaultForField(r),
    pad_rule: "pad:right:space",
    is_literal: false,
    is_placeholder: true
  };
}

export function buildSpecRulePreview(input: ExportFieldMappingPreviewInput): MappingRulePreview {
  const r: ExportFieldSeedRow = {
    export_field_id: "PREVIEW",
    field_name: input.field_name,
    question_code: input.question_code,
    field_length: input.field_length,
    values_spec_raw: input.values_spec_raw,
    domain_type: input.domain_type
  };
  const built = buildSpecRule(r);
  return {
    source_expression: built.source_expression,
    transform_pipeline: built.transform_pipeline,
    default_value: built.default_value,
    pad_rule: built.pad_rule,
    is_literal: built.is_literal,
    is_placeholder: built.is_placeholder
  };
}

function sourceClassOf(src: string): keyof MappingSourceCounts {
  if (src.startsWith("COL:")) return "COL";
  if (src.startsWith("RESP:")) return "RESP";
  return "CONST";
}

function deriveSpecResponseFields(rows: ExportFieldSeedRow[]): SpecResponseField[] {
  const seen = new Set<string>();
  const out: SpecResponseField[] = [];

  for (const r of rows) {
    const q = (r.question_code ?? "").trim();
    if (!q) continue;
    const key = `${q}:${r.field_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      question_code: q,
      field_name: r.field_name,
      field_length: r.field_length,
      domain_type: r.domain_type,
      values_spec_raw: r.values_spec_raw
    });
  }
  return out;
}

async function loadSeedRows(pool: DbPool, exportSpecId: string): Promise<ExportFieldSeedRow[]> {
  const rs = await execSql(pool, `
    SELECT
      ef.export_field_id,
      ef.field_name,
      ef.question_code,
      ef.field_length,
      ef.values_spec_raw,
      vd.domain_type
    FROM dbo.EXPORT_FIELD ef
    LEFT JOIN dbo.VALUE_DOMAIN vd ON vd.domain_id = ef.domain_id
    WHERE ef.export_spec_id = @sid
    ORDER BY ef.field_order
  `, { sid: { type: sql.UniqueIdentifier, value: exportSpecId } });

  return (rs.recordset as any[]).map((r) => ({
    export_field_id: String(r.export_field_id),
    field_name: String(r.field_name),
    question_code: r.question_code != null ? String(r.question_code) : null,
    field_length: Number(r.field_length),
    values_spec_raw: r.values_spec_raw != null ? String(r.values_spec_raw) : null,
    domain_type: r.domain_type != null ? String(r.domain_type) : null
  }));
}

function formValueFromRows(rows: ExportFieldSeedRow[], fieldName: "FORM_TYPE" | "FORM_VERSION"): string | undefined {
  const found = rows.find((r) => r.field_name.trim().toUpperCase() === fieldName);
  if (!found) return undefined;
  return extractLiteralConstant(found.values_spec_raw);
}

async function ensureMappingSet(
  pool: DbPool,
  exportSpecId: string,
  profile: MappingProfile,
  formVersionObserved: string
): Promise<string> {
  const mappingVersion = profile === "prealpha" ? 1 : 2;
  const mappingName = profile === "prealpha" ? "prealpha_20" : "spec_auto";

  const existing = await execSql(pool, `
    SELECT TOP (1) mapping_set_id
    FROM dbo.MAPPING_SET
    WHERE export_spec_id = @sid AND mapping_version = @ver
    ORDER BY created_at DESC
  `, {
    sid: { type: sql.UniqueIdentifier, value: exportSpecId },
    ver: { type: sql.Int, value: mappingVersion }
  });

  if (existing.recordset.length) {
    const mappingSetId = String(existing.recordset[0].mapping_set_id);
    await execSql(pool, `
      UPDATE dbo.MAPPING_SET
      SET mapping_name = @name, form_version_observed = @fv
      WHERE mapping_set_id = @id
    `, {
      id: { type: sql.UniqueIdentifier, value: mappingSetId },
      name: { type: sql.NVarChar(200), value: mappingName },
      fv: { type: sql.NVarChar(50), value: formVersionObserved }
    });
    return mappingSetId;
  }

  const mappingSetId = randomUUID();
  await execSql(pool, `
    INSERT INTO dbo.MAPPING_SET (mapping_set_id, export_spec_id, form_version_observed, mapping_name, mapping_version)
    VALUES (@id, @sid, @fv, @name, @ver)
  `, {
    id: { type: sql.UniqueIdentifier, value: mappingSetId },
    sid: { type: sql.UniqueIdentifier, value: exportSpecId },
    fv: { type: sql.NVarChar(50), value: formVersionObserved },
    name: { type: sql.NVarChar(200), value: mappingName },
    ver: { type: sql.Int, value: mappingVersion }
  });

  return mappingSetId;
}

async function rebuildRules(pool: DbPool, mappingSetId: string, rules: MappingRuleSeed[]) {
  await execSql(pool, `DELETE FROM dbo.MAPPING_RULE WHERE mapping_set_id = @mid`, {
    mid: { type: sql.UniqueIdentifier, value: mappingSetId }
  });

  for (const rule of rules) {
    await execSql(pool, `
      INSERT INTO dbo.MAPPING_RULE (
        mapping_rule_id, mapping_set_id, export_field_id,
        source_expression, transform_pipeline, default_value, pad_rule
      )
      VALUES (@id, @mid, @fid, @src, @xf, @def, @pad)
    `, {
      id: { type: sql.UniqueIdentifier, value: randomUUID() },
      mid: { type: sql.UniqueIdentifier, value: mappingSetId },
      fid: { type: sql.UniqueIdentifier, value: rule.export_field_id },
      src: { type: sql.NVarChar(1000), value: rule.source_expression },
      xf: { type: sql.NVarChar(1000), value: rule.transform_pipeline },
      def: { type: sql.NVarChar(200), value: rule.default_value },
      pad: { type: sql.NVarChar(200), value: rule.pad_rule }
    });
  }
}

export async function ensureMappingSetForProfile(
  pool: DbPool,
  exportSpecId: string,
  profile: MappingProfile
): Promise<MappingProfileBuildResult> {
  const rows = await loadSeedRows(pool, exportSpecId);

  const form_type_observed =
    profile === "spec" ? formValueFromRows(rows, "FORM_TYPE") ?? LEGACY_FORM_TYPE : LEGACY_FORM_TYPE;
  const form_version_observed =
    profile === "spec" ? formValueFromRows(rows, "FORM_VERSION") ?? LEGACY_FORM_VERSION : LEGACY_FORM_VERSION;

  const mappingSetId = await ensureMappingSet(pool, exportSpecId, profile, form_version_observed);

  const rules: MappingRuleSeed[] = [];
  for (const row of rows) {
    if (profile === "prealpha") {
      const maybeRule = buildPrealphaRule(row);
      if (maybeRule) rules.push(maybeRule);
    } else {
      rules.push(buildSpecRule(row));
    }
  }

  await rebuildRules(pool, mappingSetId, rules);

  const source_counts: MappingSourceCounts = { COL: 0, RESP: 0, CONST: 0 };
  let literal_field_count = 0;
  let placeholder_field_count = 0;

  for (const rule of rules) {
    source_counts[sourceClassOf(rule.source_expression)] += 1;
    if (rule.is_literal) literal_field_count += 1;
    if (rule.is_placeholder) placeholder_field_count += 1;
  }

  return {
    mapping_set_id: mappingSetId,
    source_counts,
    literal_field_count,
    placeholder_field_count,
    rule_count: rules.length,
    form_type_observed,
    form_version_observed,
    spec_response_fields: deriveSpecResponseFields(rows)
  };
}
