import { randomUUID } from "node:crypto";

import { DbPool, execSql, sql } from "../../db/db_connect";
import { classifyValuesSpec, inferNumericTemplateWidth } from "../spec_import/spec_values_part_01_utils";
import { Rng } from "./generator_part_01_rng";
import { AssessmentRow } from "./generator_part_02_insert_assessments";

type ResponseSeed = {
  question_code: string;
  field_name: string;
  value_raw: string;
  value_norm?: string;
};

export type ResponseGenerationProfile = "prealpha" | "spec";

export type SpecResponseSeedField = {
  question_code: string;
  field_name: string;
  field_length: number;
  domain_type: string | null;
  values_spec_raw: string | null;
};

export type InsertResponsesOptions = {
  profile: ResponseGenerationProfile;
  seed: number;
  spec_response_fields?: SpecResponseSeedField[];
};

function yyyymmdd(dateIso: string): string {
  return dateIso.replaceAll("-", "");
}

function hashString32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededFieldRng(seed: number, recordOrdinal: number, questionCode: string, fieldName: string): Rng {
  const h = hashString32(`${seed}|${recordOrdinal}|${questionCode}|${fieldName}`);
  return new Rng(h || 1);
}

function alnum(rng: Rng, n: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[rng.int(0, chars.length - 1)];
  return out;
}

function dateFromEvent(eventDateIso: string, rng: Rng): string {
  const base = new Date(eventDateIso + "T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - rng.int(0, 365));
  return base.toISOString().slice(0, 10);
}

function dateOfBirthFromEvent(eventDateIso: string, rng: Rng): string {
  const base = new Date(eventDateIso + "T00:00:00Z");
  const years = rng.int(18, 42);
  base.setUTCFullYear(base.getUTCFullYear() - years);
  base.setUTCDate(base.getUTCDate() - rng.int(0, 3650));
  return base.toISOString().slice(0, 10);
}

export function generateSpecResponseValue(
  field: SpecResponseSeedField,
  eventDateIso: string,
  seed: number,
  recordOrdinal: number
): string {
  const rng = seededFieldRng(seed, recordOrdinal, field.question_code, field.field_name);
  const name = field.field_name.trim().toUpperCase();

  if (name === "LNAME") return `LAST${rng.digits(6)}`;
  if (name === "FNAME") return `FIRST${rng.digits(6)}`;
  if (name === "MI") return rng.alpha(1);
  if (name === "EMAIL") return `user${rng.digits(6)}@example.mil`;

  const spec = classifyValuesSpec(field.field_name, field.values_spec_raw);

  if ((spec.kind === "enum" || spec.kind === "enum_yn") && spec.enum_pairs && spec.enum_pairs.length) {
    const codes = spec.enum_pairs.map((x) => x.code);
    return codes[rng.int(0, codes.length - 1)];
  }

  if (field.domain_type === "DATE_YYYYMMDD" || spec.kind === "date_yyyymmdd") {
    if (name.includes("DOB")) {
      return yyyymmdd(dateOfBirthFromEvent(eventDateIso, rng));
    }
    return yyyymmdd(dateFromEvent(eventDateIso, rng));
  }

  if (field.domain_type === "DODID10" || spec.kind === "dodid10") {
    return rng.digits(10);
  }

  const numericWidth = inferNumericTemplateWidth(field.values_spec_raw);
  if (numericWidth) {
    return rng.digits(Math.max(1, numericWidth));
  }

  const width = Math.max(1, Math.min(field.field_length, 16));
  const prefix = name.replace(/[^A-Z0-9]/g, "").slice(0, Math.min(4, width));
  if (prefix.length >= width) return prefix.slice(0, width);
  return (prefix + alnum(rng, width - prefix.length)).slice(0, width);
}

function buildPrealphaResponses(a: AssessmentRow, rng: Rng): ResponseSeed[] {
  const services = ["F", "A", "N", "M", "C", "X", "P", "D"];
  const components = ["A", "N", "R", "X"];
  const grades = ["E04", "E05", "E06", "O02", "W02"];

  const last = `LAST${rng.digits(6)}`;
  const first = `FIRST${rng.digits(6)}`;
  const mi = rng.alpha(1);

  const years = rng.int(18, 42);
  const base = new Date(a.event_date + "T00:00:00Z");
  base.setUTCFullYear(base.getUTCFullYear() - years);
  base.setUTCDate(base.getUTCDate() - rng.int(0, 3650));
  const dobIso = base.toISOString().slice(0, 10);

  const sex = rng.pick(["M", "F"]);
  const svc = rng.pick(services);
  const comp = rng.pick(components);
  const grade = rng.pick(grades);

  const unitName = `UNIT_${rng.digits(6)}`;
  const unitLoc = `BASE_${rng.digits(6)}`;
  const emailRaw = `user${rng.digits(6)}@example.mil`;
  const tricare = rng.pick(["Y", "N"]);

  return [
    { question_code: "DEM", field_name: "LNAME", value_raw: last },
    { question_code: "DEM", field_name: "FNAME", value_raw: first },
    { question_code: "DEM", field_name: "MI", value_raw: mi },
    { question_code: "DEM", field_name: "DOB", value_raw: yyyymmdd(dobIso) },
    { question_code: "DEM", field_name: "SEX", value_raw: sex },
    { question_code: "DEM", field_name: "FORM_SERVICE", value_raw: svc },
    { question_code: "DEM", field_name: "FORM_COMPONENT", value_raw: comp },
    { question_code: "DEM", field_name: "GRADE", value_raw: grade },
    { question_code: "DEM", field_name: "UNIT_NAME", value_raw: unitName },
    { question_code: "DEM", field_name: "UNIT_LOC", value_raw: unitLoc },
    { question_code: "DEM", field_name: "EMAIL", value_raw: emailRaw, value_norm: emailRaw.toLowerCase() },
    { question_code: "HP16", field_name: "TRICARE", value_raw: tricare }
  ];
}

function buildSpecResponses(
  a: AssessmentRow,
  specFields: SpecResponseSeedField[],
  seed: number,
  recordOrdinal: number
): ResponseSeed[] {
  const dedup = new Set<string>();
  const out: ResponseSeed[] = [];

  for (const f of specFields) {
    const q = (f.question_code ?? "").trim();
    if (!q) continue;

    const key = `${q}:${f.field_name}`;
    if (dedup.has(key)) continue;
    dedup.add(key);

    const raw = generateSpecResponseValue(f, a.event_date, seed, recordOrdinal);
    const norm = f.field_name.trim().toUpperCase().includes("EMAIL") ? raw.toLowerCase() : raw;
    out.push({
      question_code: q,
      field_name: f.field_name,
      value_raw: raw,
      value_norm: norm
    });
  }
  return out;
}

async function insertResponses(pool: DbPool, assessmentId: string, responses: ResponseSeed[]) {
  for (const r of responses) {
    await execSql(pool, `
      INSERT INTO dbo.RESPONSE (response_id, assessment_id, question_code, field_name, value_raw, value_norm)
      VALUES (@id, @aid, @q, @f, @raw, @norm)
    `, {
      id: { type: sql.UniqueIdentifier, value: randomUUID() },
      aid: { type: sql.UniqueIdentifier, value: assessmentId },
      q: { type: sql.NVarChar(50), value: r.question_code },
      f: { type: sql.NVarChar(100), value: r.field_name },
      raw: { type: sql.NVarChar(4000), value: r.value_raw },
      norm: { type: sql.NVarChar(4000), value: r.value_norm ?? r.value_raw }
    });
  }
}

export async function insertResponsesAndProviderReviews(
  pool: DbPool,
  rng: Rng,
  assessments: AssessmentRow[],
  opts: InsertResponsesOptions
) {
  for (let i = 0; i < assessments.length; i++) {
    const a = assessments[i];
    const ordinal = i + 1;

    const responses =
      opts.profile === "spec"
        ? buildSpecResponses(a, opts.spec_response_fields ?? [], opts.seed, ordinal)
        : buildPrealphaResponses(a, rng);

    await insertResponses(pool, a.assessment_id, responses);

    const provider_name = `Dr ${rng.digits(6)}`;
    const certify_date = a.event_date;
    const provider_title = String(rng.int(1, 8));
    const provider_signature = rng.pick(["Y", "N"]);

    await execSql(pool, `
      INSERT INTO dbo.PROVIDER_REVIEW (assessment_id, provider_name, certify_date, provider_title, provider_signature)
      VALUES (@aid, @pn, @cd, @pt, @ps)
    `, {
      aid: { type: sql.UniqueIdentifier, value: a.assessment_id },
      pn: { type: sql.NVarChar(200), value: provider_name },
      cd: { type: sql.Date, value: certify_date },
      pt: { type: sql.NVarChar(50), value: provider_title },
      ps: { type: sql.NVarChar(200), value: provider_signature }
    });
  }
}
