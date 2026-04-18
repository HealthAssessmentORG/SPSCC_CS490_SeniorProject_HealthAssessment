import { DbPool, execSql, sql } from "../../db/db_connect";
import { Rng } from "../generator/generator_part_01_rng";
import {
  formatDateYyyymmdd,
  seededRngFromParts,
  truncateValue
} from "../shared/deterministic_utils";

export type Alpha1FieldRow = {
  field_id: number;
  field_code: string;
  field_name: string;
};

export type Alpha1PreviewField = Alpha1FieldRow & {
  response: string;
};

export type Alpha1AssessmentPreview = {
  assessment_index: number;
  fields: Alpha1PreviewField[];
};

export type Alpha1InsertedAssessment = {
  assessment_index: number;
  assessment_id: string;
  response_count: number;
};

export type Alpha1CheckDbResult = {
  ok: boolean;
  database: string;
  tables: {
    ASSESSMENT: boolean;
    FIELD: boolean;
    RESPONSE: boolean;
  };
  field_count: number;
};

export type Alpha1CommandOptions =
  | { command: "check-db" }
  | { command: "fields" }
  | { command: "generate"; gen: number; seed: number; dryRun: boolean };

export type Alpha1CommandResult =
  | { command: "check-db"; result: Alpha1CheckDbResult }
  | { command: "fields"; fields: Alpha1FieldRow[] }
  | { command: "generate"; dryRun: true; result: Alpha1AssessmentPreview[] }
  | { command: "generate"; dryRun: false; result: Alpha1InsertedAssessment[] };

const REQUIRED_TABLES = ["ASSESSMENT", "FIELD", "RESPONSE"] as const;
const DATE_ANCHOR_UTC = Date.UTC(2025, 0, 1);

function normalizeKey(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function getFieldPhraseContext(field: Alpha1FieldRow) {
  const nameText = ` ${normalizePhrase(field.field_name)} `;
  const code = normalizeKey(field.field_code);

  function hasCode(...codes: string[]) {
    return codes.some((candidate) => code === normalizeKey(candidate));
  }

  function hasPhrase(...phrases: string[]) {
    return phrases.some((phrase) => {
      const normalized = normalizePhrase(phrase);
      return normalized.length > 0 && nameText.includes(` ${normalized} `);
    });
  }

  function hasWord(...words: string[]) {
    return words.some((word) => {
      const normalized = normalizePhrase(word);
      return normalized.length > 0 && nameText.includes(` ${normalized} `);
    });
  }

  return { hasCode, hasPhrase, hasWord };
}

function buildDate(offsetDays: number): Date {
  const date = new Date(DATE_ANCHOR_UTC);
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date;
}

function fallbackAlphaNum(rng: Rng, field: Alpha1FieldRow): string {
  const normalized = normalizeKey(field.field_code || field.field_name || "FIELD");
  const prefix = normalized.slice(0, 4) || "VAL";
  const width = Math.max(6, Math.min(12, normalized.length || 8));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";

  while ((prefix + suffix).length < width) {
    suffix += chars[rng.int(0, chars.length - 1)];
  }

  return (prefix + suffix).slice(0, width);
}

function truncateResponse(value: string, maxLength = 255): string {
  return truncateValue(value, maxLength);
}

function generateAlpha1Response(field: Alpha1FieldRow, seed: number, assessmentIndex: number): string {
  const rng = seededRngFromParts(seed, assessmentIndex, field.field_code, field.field_name);
  const ctx = getFieldPhraseContext(field);

  if (ctx.hasCode("LNAME", "LASTNAME") || ctx.hasPhrase("last name", "surname")) {
    return truncateResponse(`LAST${rng.digits(6)}`);
  }

  if (ctx.hasCode("FNAME", "FIRSTNAME") || ctx.hasPhrase("first name", "given name")) {
    return truncateResponse(`FIRST${rng.digits(6)}`);
  }

  if (ctx.hasCode("MI", "MIDDLEINITIAL", "MIDINIT") || ctx.hasPhrase("middle initial")) {
    return truncateResponse(rng.alpha(1));
  }

  if (ctx.hasCode("EMAIL", "EMAILADDRESS") || ctx.hasWord("email")) {
    return truncateResponse(`user${rng.digits(6)}@example.mil`.toLowerCase());
  }

  if (ctx.hasCode("SEX", "GENDER") || ctx.hasWord("gender", "sex")) {
    return truncateResponse(rng.pick(["M", "F"]));
  }

  if (ctx.hasCode("DODID", "EDIPI") || ctx.hasPhrase("dod id", "dod id number") || ctx.hasWord("edipi")) {
    return truncateResponse(rng.digits(10));
  }

  if (ctx.hasPhrase("phone number", "cell phone number", "commercial phone number") || ctx.hasWord("phone", "dsn")) {
    return truncateResponse(rng.digits(10));
  }

  if (ctx.hasPhrase("zip code") || ctx.hasWord("zip")) {
    return truncateResponse(rng.digits(5));
  }

  if (ctx.hasPhrase("pay grade")) {
    return truncateResponse(rng.pick(["E04", "E05", "E06", "O02", "W02"]));
  }

  if (ctx.hasPhrase("service branch")) {
    return truncateResponse(rng.pick(["ARMY", "NAVY", "AIR FORCE", "MARINES", "SPACE FORCE", "COAST GUARD"]));
  }

  if (ctx.hasWord("component")) {
    return truncateResponse(rng.pick(["ACTIVE", "RESERVE", "GUARD"]));
  }

  if (ctx.hasCode("DOB") || ctx.hasPhrase("date of birth", "birth date")) {
    const years = rng.int(18, 42);
    const date = new Date(DATE_ANCHOR_UTC);
    date.setUTCFullYear(date.getUTCFullYear() - years);
    date.setUTCDate(date.getUTCDate() - rng.int(0, 3650));
    return truncateResponse(formatDateYyyymmdd(date));
  }

  if (ctx.hasPhrase("todays date", "date completed") || ctx.hasWord("today", "todays", "date")) {
    return truncateResponse(formatDateYyyymmdd(buildDate(rng.int(0, 365))));
  }

  return truncateResponse(fallbackAlphaNum(rng, field));
}

export function buildAlpha1PreviewBatch(
  fields: Alpha1FieldRow[],
  count: number,
  seed: number
): Alpha1AssessmentPreview[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("FIELD table is empty; cannot generate assessments.");
  }

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("generate requires -gen <positive integer>");
  }

  return Array.from({ length: count }, (_, index) => ({
    assessment_index: index + 1,
    fields: fields.map((field) => ({
      ...field,
      response: generateAlpha1Response(field, seed, index + 1)
    }))
  }));
}

async function checkAlpha1Database(pool: DbPool): Promise<Alpha1CheckDbResult> {
  const databaseResult = await execSql(pool, "SELECT DB_NAME() AS database_name");
  const database = String(databaseResult.recordset[0]?.database_name ?? "");
  const tablesResult = await execSql(
    pool,
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME IN ('ASSESSMENT', 'FIELD', 'RESPONSE')
    `
  );

  const found = new Set<string>(
    (tablesResult.recordset as Array<{ TABLE_NAME: string }>).map((row) => String(row.TABLE_NAME).toUpperCase())
  );

  const tables = {
    ASSESSMENT: found.has("ASSESSMENT"),
    FIELD: found.has("FIELD"),
    RESPONSE: found.has("RESPONSE")
  };

  const missing = REQUIRED_TABLES.filter((name) => !tables[name]);
  if (missing.length > 0) {
    throw new Error(
      `Connected to database "${database}" but Missing required tables: ${missing.join(", ")}. Expected alpha1 DB like "DD2975_PreDHA".`
    );
  }

  const fieldCountResult = await execSql(pool, "SELECT COUNT(*) AS field_count FROM dbo.FIELD");

  return {
    ok: true,
    database,
    tables,
    field_count: Number(fieldCountResult.recordset[0]?.field_count ?? 0)
  };
}

async function loadAlpha1Fields(pool: DbPool): Promise<Alpha1FieldRow[]> {
  const result = await execSql(
    pool,
    `
      SELECT field_id, field_code, field_name
      FROM dbo.FIELD
      ORDER BY field_id
    `
  );

  return (result.recordset as Array<{ field_id: number; field_code: string; field_name: string }>).map((row) => ({
    field_id: Number(row.field_id),
    field_code: String(row.field_code ?? "").trim(),
    field_name: String(row.field_name ?? "").trim()
  }));
}

async function insertSingleAssessment(
  pool: DbPool,
  preview: Alpha1AssessmentPreview
): Promise<Alpha1InsertedAssessment> {
  const tx = new sql.Transaction(pool);
  let started = false;

  try {
    await tx.begin();
    started = true;

    const assessmentInsert = await execSql(
      tx,
      `
        INSERT INTO dbo.ASSESSMENT
        OUTPUT INSERTED.assessment_id AS assessment_id
        DEFAULT VALUES;
      `
    );

    const assessmentId = String(assessmentInsert.recordset[0]?.assessment_id ?? "");

    for (const field of preview.fields) {
      await execSql(
        tx,
        `
          INSERT INTO dbo.RESPONSE (assessment_id, field_id, response)
          VALUES (@assessment_id, @field_id, @response)
        `,
        {
          assessment_id: { type: sql.BigInt, value: assessmentId },
          field_id: { type: sql.Int, value: field.field_id },
          response: { type: sql.VarChar(255), value: field.response }
        }
      );
    }

    await tx.commit();
    started = false;

    return {
      assessment_index: preview.assessment_index,
      assessment_id: assessmentId,
      response_count: preview.fields.length
    };
  } catch (error) {
    if (started) {
      try {
        await tx.rollback();
      } catch {
        // Ignore rollback failures and surface the original error.
      }
    }

    throw error;
  }
}

async function generateAlpha1Assessments(
  pool: DbPool,
  fields: Alpha1FieldRow[],
  count: number,
  seed: number,
  dryRun: true
): Promise<Alpha1AssessmentPreview[]>;
async function generateAlpha1Assessments(
  pool: DbPool,
  fields: Alpha1FieldRow[],
  count: number,
  seed: number,
  dryRun: false
): Promise<Alpha1InsertedAssessment[]>;
async function generateAlpha1Assessments(
  pool: DbPool,
  fields: Alpha1FieldRow[],
  count: number,
  seed: number,
  dryRun: boolean
): Promise<Alpha1AssessmentPreview[] | Alpha1InsertedAssessment[]> {
  const previews = buildAlpha1PreviewBatch(fields, count, seed);
  if (dryRun) return previews;

  const inserted: Alpha1InsertedAssessment[] = [];
  for (const preview of previews) {
    inserted.push(await insertSingleAssessment(pool, preview));
  }

  return inserted;
}

export async function runAlpha1Command(
  pool: DbPool,
  options: Alpha1CommandOptions
): Promise<Alpha1CommandResult> {
  if (options.command === "check-db") {
    return {
      command: "check-db",
      result: await checkAlpha1Database(pool)
    };
  }

  if (options.command === "fields") {
    return {
      command: "fields",
      fields: await loadAlpha1Fields(pool)
    };
  }

  const fields = await loadAlpha1Fields(pool);
  if (options.dryRun) {
    return {
      command: "generate",
      dryRun: true,
      result: await generateAlpha1Assessments(pool, fields, options.gen, options.seed, true)
    };
  }

  return {
    command: "generate",
    dryRun: false,
    result: await generateAlpha1Assessments(pool, fields, options.gen, options.seed, false)
  };
}
