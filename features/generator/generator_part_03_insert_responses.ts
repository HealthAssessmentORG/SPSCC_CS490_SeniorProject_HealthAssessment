import { randomUUID } from "node:crypto";

import { DbPool, execSql, sql } from "../../db/db_connect";
import { classifyValuesSpec, inferNumericTemplateWidth } from "../spec_import/spec_values_part_01_utils";
import { Rng } from "./generator_part_01_rng";
import { AssessmentRow } from "./generator_part_02_insert_assessments";

/**
 * Data used to seed a single response for the generator.
 *
 * Maps a question identifier and field name to a raw value and an optional normalized value for downstream processing.
 *
 * @property question_code - Unique code identifying the question this response is for.
 * @property field_name - Name of the field or response attribute within the question.
 * @property value_raw - The original/raw string value captured for this field.
 * @property value_norm - Optional normalized/standardized form of value_raw (e.g., trimmed, parsed, or reformatted).
 */
type ResponseSeed = {
  question_code: string;
  field_name: string;
  value_raw: string;
  value_norm?: string;
};

export type ResponseGenerationProfile = "prealpha" | "spec";

/**
 * Specification for a single response field used when seeding/generating responses.
 *
 * Represents metadata about a question's response field that the generator consumes
 * to create or validate seeded data.
 *
 * @property question_code - Unique identifier for the question this field belongs to.
 * @property field_name - Human- or system-readable name of the response field.
 * @property field_length - Maximum allowed length for the field's value (number of characters).
 * @property domain_type - Optional classification of the field's domain (e.g., "numeric", "text"); null if unspecified.
 * @property values_spec_raw - Optional raw specification (string) describing allowed values, enumerations, or formatting rules; null if none.
 */
export type SpecResponseSeedField = {
  question_code: string;
  field_name: string;
  field_length: number;
  domain_type: string | null;
  values_spec_raw: string | null;
};

/**
 * Options for inserting generated responses.
 *
 * Provides the generation profile, a deterministic seed for reproducible output,
 * and optional per-field seed/configuration overrides.
 *
 * @property profile - The ResponseGenerationProfile that controls how responses are generated.
 * @property seed - A numeric seed used for deterministic pseudo-random generation.
 * @property spec_response_fields - Optional array of SpecResponseSeedField entries to override or
 *   seed specific response fields.
 */
export type InsertResponsesOptions = {
  profile: ResponseGenerationProfile;
  seed: number;
  spec_response_fields?: SpecResponseSeedField[];
};

/**
 * Convert an ISO date string to a compact "yyyymmdd" format by removing hyphens.
 *
 * @param dateIso - An ISO-formatted date string (typically "YYYY-MM-DD").
 * @returns The date string in "YYYYMMDD" form.
 * @remarks This function removes all '-' characters from the input and does not validate the date or its format.
 */
function yyyymmdd(dateIso: string): string {
  return dateIso.replaceAll("-", "");
}

/**
 * Computes a 32-bit FNV-1a hash of the given string.
 *
 * The implementation processes UTF-16 code units (uses String#charCodeAt),
 * so surrogate pairs (astral plane characters) are treated as two separate
 * code units rather than a single Unicode code point.
 *
 * @param s - The input string to hash.
 * @returns An unsigned 32-bit integer representing the FNV-1a hash of the input.
 */
function hashString32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Creates a seeded random number generator for a specific field in a survey response.
 * 
 * This function generates a deterministic RNG by hashing a combination of the seed,
 * record ordinal, question code, and field name. This ensures that the same inputs
 * will always produce the same random sequence, which is useful for reproducible
 * data generation.
 * 
 * @param seed - The base seed value for random number generation
 * @param recordOrdinal - The ordinal number of the record being generated
 * @param questionCode - The unique code identifying the survey question
 * @param fieldName - The name of the field within the question
 * @returns A seeded random number generator (Rng) instance initialized with a hash
 *          of the input parameters, or 1 if the hash returns a falsy value
 */
function seededFieldRng(seed: number, recordOrdinal: number, questionCode: string, fieldName: string): Rng {
  const h = hashString32(`${seed}|${recordOrdinal}|${questionCode}|${fieldName}`);
  return new Rng(h || 1);
}

/**
 * Generates a random alphanumeric string of uppercase letters and digits.
 * 
 * @param rng - A random number generator instance used to generate random indices
 * @param n - The desired length of the generated string
 * @returns A string of length `n` containing random uppercase letters (A-Z) and digits (0-9)
 * 
 * @example
 * ```ts
 * const result = alnum(rng, 8);
 * // Returns something like: "A3K9MZ7Q"
 * ```
 */
function alnum(rng: Rng, n: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[rng.int(0, chars.length - 1)];
  return out;
}

/**
 * Generates a random date before the given event date.
 * 
 * @param eventDateIso - The event date in ISO format (YYYY-MM-DD)
 * @param rng - Random number generator instance used to determine the offset
 * @returns A date string in ISO format (YYYY-MM-DD) that is 0-365 days before the event date
 */
function dateFromEvent(eventDateIso: string, rng: Rng): string {
  const base = new Date(eventDateIso + "T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - rng.int(0, 365));
  return base.toISOString().slice(0, 10);
}

/**
 * Generates a synthetic date of birth based on an event date and randomization.
 *
 * The calculation starts from the provided event date (interpreted as UTC midnight),
 * subtracts a random age between 18 and 42 years, then subtracts an additional
 * random number of days between 0 and 3650 to further vary the result.
 *
 * @param eventDateIso - Event date in `YYYY-MM-DD` ISO format.
 * @param rng - Random number generator used to produce deterministic integer offsets.
 * @returns A date-of-birth string in `YYYY-MM-DD` ISO format.
 */
function dateOfBirthFromEvent(eventDateIso: string, rng: Rng): string {
  const base = new Date(eventDateIso + "T00:00:00Z");
  const years = rng.int(18, 42);
  base.setUTCFullYear(base.getUTCFullYear() - years);
  base.setUTCDate(base.getUTCDate() - rng.int(0, 3650));
  return base.toISOString().slice(0, 10);
}

/**
 * Generates a random response value for a specification field based on its type and constraints.
 * 
 * This function uses a seeded random number generator to create deterministic, reproducible
 * values for various field types including names, emails, dates, DOD IDs, and other domain-specific
 * formats.
 * 
 * @param field - The specification field containing metadata about the response field including
 *                field name, domain type, length constraints, and value specifications
 * @param eventDateIso - The ISO date string of the event, used as a reference point for generating
 *                       relative dates (e.g., date of birth)
 * @param seed - The seed value for the random number generator to ensure reproducibility
 * @param recordOrdinal - The ordinal position of the record being generated, used to vary values
 *                        across multiple records with the same seed
 * 
 * @returns A string value appropriate for the field type, which may be:
 *          - A generated name (last name, first name, or middle initial)
 *          - An email address in the format `user######@example.mil`
 *          - An enumerated code from the field's value specification
 *          - A date in YYYYMMDD format
 *          - A 10-digit DOD ID
 *          - A numeric value matching the field's template width
 *          - An alphanumeric string based on the field name prefix and length constraints
 */
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

/**
 * Builds an array of pre-alpha response seeds with randomly generated demographic and health assessment data.
 * 
 * @param a - The assessment row containing the event date used as a reference point for DOB calculation
 * @param rng - The random number generator used to create pseudo-random values for all fields
 * @returns An array of ResponseSeed objects containing demographic information (DEM) and TRICARE enrollment status (HP16)
 * 
 * @remarks
 * Generates the following demographic fields:
 * - Last name, first name, and middle initial (randomly generated strings)
 * - Date of birth (calculated as 18-42 years before the assessment event date, with additional random variation of 0-10 years)
 * - Sex (M or F)
 * - Military service branch (F, A, N, M, C, X, P, or D)
 * - Military component (A, N, R, or X)
 * - Military grade (E04, E05, E06, O02, or W02)
 * - Unit name and location (randomly generated identifiers)
 * - Email address (randomly generated example.mil email)
 * - TRICARE enrollment status (Y or N)
 * 
 * This was used to generate synthetic response data for the pre-alpha dataset, which did not have a defined spec or real response values to seed from. The generated values are deterministic based on the provided RNG and assessment event date, allowing for reproducibility across runs with the same seed and input data.
 */
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

/**
 * Builds a normalized, de-duplicated list of seeded spec response records for a single assessment row.
 *
 * Iterates all provided `specFields`, skipping entries with a missing/blank `question_code` and
 * removing duplicates by the composite key `${question_code}:${field_name}`. For each unique field,
 * a raw value is generated via `generateSpecResponseValue(...)`, then conditionally normalized:
 * values whose `field_name` contains `"EMAIL"` (case-insensitive) are lowercased for `value_norm`;
 * all others preserve the raw value as-is.
 *
 * @param a - Source assessment row, including the event date used for value generation.
 * @param specFields - Seed field definitions used to generate per-question response values.
 * @param seed - Deterministic seed input for response value generation.
 * @param recordOrdinal - Record index/ordinal used to vary deterministic generated values.
 * @returns Array of `ResponseSeed` entries containing `question_code`, `field_name`, `value_raw`, and `value_norm`.
 */
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

/**
 * Inserts response records into the database for a given assessment.
 * @param pool - The database connection pool
 * @param assessmentId - The unique identifier of the assessment
 * @param responses - Array of response objects to be inserted
 * @returns A promise that resolves when all responses have been inserted
 */
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

/**
 * Inserts generated response records and a corresponding provider review for each assessment.
 *
 * For every assessment in the provided list, this function:
 * - Builds response payloads using either the `"spec"` profile (`buildSpecResponses`) or prealpha profile (`buildPrealphaResponses`).
 * - Persists those responses via `insertResponses`.
 * - Generates provider review metadata (`provider_name`, `certify_date`, `provider_title`, `provider_signature`) using the RNG and assessment data.
 * - Inserts a row into `dbo.PROVIDER_REVIEW`.
 *
 * @param pool - Database connection pool used for all insert operations.
 * @param rng - Random generator used to create synthetic provider review fields (and prealpha responses).
 * @param assessments - Ordered assessment rows to process; order determines the 1-based `ordinal` passed to spec response generation.
 * @param opts - Response insertion options, including profile selection and optional spec response field configuration.
 * @returns A promise that resolves when all responses and provider reviews have been inserted.
 */
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
