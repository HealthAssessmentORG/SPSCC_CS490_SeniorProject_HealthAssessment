import { randomUUID } from "node:crypto";

import { DbPool, execSql, sql } from "../../db/db_connect";
import { Rng } from "../generator/generator_part_01_rng";
import { classifyValuesSpec, extractLiteralConstant } from "../spec_import/spec_values_part_01_utils";

/**
 * Represents the available mapping profile variants used by the seeding/mapping feature.
 *
 * - `"spec"`: The specification-aligned profile.
 * - `"prealpha"`: An early, pre-alpha profile variant.
 */
export type MappingProfile = "spec" | "prealpha";

/**
 * Represents the count of mapping entries grouped by source category.
 *
 * @property COL - Total number of mappings originating from column-based sources.
 * @property RESP - Total number of mappings originating from response-based sources.
 * @property CONST - Total number of mappings originating from constant-value sources.
 */
export type MappingSourceCounts = {
  COL: number;
  RESP: number;
  CONST: number;
};

/**
 * Summary statistics describing a mapping seed profile.
 *
 * @property mapping_set_id - Unique identifier of the mapping set these statistics belong to.
 * @property source_counts - Count breakdown of mappings by source category.
 * @property literal_field_count - Number of fields mapped using literal values.
 * @property placeholder_field_count - Number of fields mapped using placeholder values.
 * @property rule_count - Total number of mapping rules included in the profile.
 */
export type MappingSeedStats = {
  mapping_set_id: string;
  source_counts: MappingSourceCounts;
  literal_field_count: number;
  placeholder_field_count: number;
  rule_count: number;
};

/**
 * Represents the schema metadata for a single response field in a specification mapping.
 *
 * @property question_code - Identifier of the source question associated with this field.
 * @property field_name - Name of the target field where the response value is stored.
 * @property field_length - Maximum allowed length for the field value.
 * @property domain_type - Optional domain/category describing the field's value type constraints.
 * @property values_spec_raw - Optional raw specification string defining allowed or expected values.
 */
export type SpecResponseField = {
  question_code: string;
  field_name: string;
  field_length: number;
  domain_type: string | null;
  values_spec_raw: string | null;
};

/**
 * Represents the result of building a mapping profile seed record.
 *
 * Extends {@link MappingSeedStats} with the observed form identity and
 * the response-field specifications collected for that profile build.
 *
 * @property form_type_observed - The form type detected during profile generation.
 * @property form_version_observed - The form version detected during profile generation.
 * @property spec_response_fields - The set of response-field specifications associated with the observed form.
 */
export type MappingProfileBuildResult = MappingSeedStats & {
  form_type_observed: string;
  form_version_observed: string;
  spec_response_fields: SpecResponseField[];
};

/**
 * Preview model for a single mapping rule configuration used during profile seeding.
 *
 * @property source_expression - The source-side expression or path used to read input data.
 * @property transform_pipeline - A serialized list/descriptor of transforms applied to the source value.
 * @property default_value - Fallback value used when the source is missing, invalid, or empty.
 * @property pad_rule - Padding behavior specification (for example width, character, and alignment).
 * @property is_literal - Indicates the rule uses a fixed literal value instead of evaluating a source expression.
 * @property is_placeholder - Indicates the rule is a placeholder entry and not a finalized mapping.
 */
export type MappingRulePreview = {
  source_expression: string;
  transform_pipeline: string;
  default_value: string;
  pad_rule: string;
  is_literal: boolean;
  is_placeholder: boolean;
};

/**
 * Represents a preview record for export field-to-question mappings used during
 * profile seeding and validation workflows.
 *
 * @property field_name - The target export field identifier/name.
 * @property question_code - The source question code mapped to the field, or `null` if unmapped.
 * @property field_length - The maximum allowed length for the export field value.
 * @property values_spec_raw - Raw value/domain specification text, if provided; otherwise `null`.
 * @property domain_type - The domain/category type associated with the field, or `null` when unspecified.
 */
export type ExportFieldMappingPreviewInput = {
  field_name: string;
  question_code: string | null;
  field_length: number;
  values_spec_raw: string | null;
  domain_type: string | null;
};

/**
 * Represents a row of data for seeding export field configurations.
 * 
 * This type defines the structure of export field seed data, which maps
 * question codes to their corresponding export field specifications.
 * 
 * @property export_field_id - Unique identifier for the export field
 * @property field_name - The name/label of the export field
 * @property question_code - Optional code that links to a specific question
 * @property field_length - Maximum length constraint for the field value
 * @property values_spec_raw - Optional raw specification string defining valid values or format
 * @property domain_type - Optional classification/category of the domain this field belongs to
 */
type ExportFieldSeedRow = {
  export_field_id: string;
  field_name: string;
  question_code: string | null;
  field_length: number;
  values_spec_raw: string | null;
  domain_type: string | null;
};

/**
 * Represents the seed data structure for a mapping rule configuration.
 * 
 * @remarks
 * This type defines the schema for mapping rules used to transform and export data fields.
 * It specifies how source data should be processed, transformed, and formatted before export.
 * 
 * @property export_field_id - Unique identifier for the target export field
 * @property source_expression - Expression defining the source data location or query
 * @property transform_pipeline - Pipeline configuration for data transformation operations
 * @property default_value - Fallback value to use when source data is unavailable
 * @property pad_rule - Formatting rule for padding the output value (e.g., zero-padding, space-padding)
 * @property is_literal - Flag indicating whether the value should be treated as a literal constant
 * @property is_placeholder - Flag indicating whether this is a placeholder mapping rule
 */
type MappingRuleSeed = {
  export_field_id: string;
  source_expression: string;
  transform_pipeline: string;
  default_value: string;
  pad_rule: string;
  is_literal: boolean;
  is_placeholder: boolean;
};

/**
 * The legacy form type identifier used for pre-existing or previous form versions.
 * 
 * This constant represents the form type value that was observed in legacy data and mappings,
 * particularly for the DD Form 2795 used in pre-alpha mapping profiles. It is maintained
 * for backward compatibility and to ensure consistent mapping behavior when the form type 
 * is not explicitly specified in the export field configurations.
 * 
 * Constant representing the legacy form type identifier.
 * Used to identify forms created before the current system implementation.
 * 
 * @constant
 * @type {string}
 * @default "LEGACY_FORM_TYPE"
 */
const LEGACY_FORM_TYPE = "PRE";

/**
 * The legacy form version identifier for DD Form 2795.
 * 
 * This constant represents the June 2020 version of the DD Form 2795
 * (Pre-Deployment Health Assessment) that was previously used in the system.
 * It is maintained for backward compatibility and data migration purposes.
 * 
 * @constant
 * @type {string}
 * @default "DD2795_202006"
 */
const LEGACY_FORM_VERSION = "DD2795_202006";

/**
 * Mapping rules for PREALPHA format field transformations and padding.
 * 
 * Defines how data fields should be extracted, transformed, and formatted for PREALPHA output.
 * Each rule specifies:
 * - `src`: Source of the data (COL: for column data, RESP: for response data)
 * - `xform`: Transformation(s) to apply (e.g., "trim", "date:yyyymmdd", "trim|lower")
 * - `pad`: Padding configuration (e.g., "pad:right:space")
 * 
 * @remarks
 * Source prefixes:
 * - `COL:` - Direct column reference (e.g., COL:ASSESSMENT.form_type_observed)
 * - `RESP:` - Response data reference with category and field (e.g., RESP:DEM:LNAME)
 * 
 * Common transformations:
 * - `trim` - Remove leading/trailing whitespace
 * - `lower` - Convert to lowercase
 * - `date:yyyymmdd` - Format date as YYYYMMDD
 * - Multiple transforms can be chained with `|`
 * 
 * @example
 * ```typescript
 * // Access a specific rule
 * const emailRule = PREALPHA_RULES.EMAIL;
 * // emailRule.src = "RESP:DEM:EMAIL"
 * // emailRule.xform = "trim|lower"
 * // emailRule.pad = "pad:right:space"
 * ```
 */
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

/**
 * Mapping rules for specification columns to their corresponding database column paths.
 * 
 * @remarks
 * This record defines the relationship between specification column names and their
 * actual database column locations using dot notation with table prefixes.
 * 
 * @example
 * ```typescript
 * const columnPath = SPEC_COLUMN_RULES.DODID; // "COL:DEPLOYER.dod_id"
 * ```
 */
const SPEC_COLUMN_RULES: Record<string, string> = {
  DODID: "COL:DEPLOYER.dod_id",
  D_EVENT: "COL:ASSESSMENT.event_date",
  PROVIDER_NAME: "COL:PROVIDER_REVIEW.provider_name",
  CERTIFY_DATE: "COL:PROVIDER_REVIEW.certify_date",
  PROVIDER_TITLE: "COL:PROVIDER_REVIEW.provider_title",
  CERT_PROVIDER: "COL:PROVIDER_REVIEW.provider_signature"
};

/**
 * Computes a 32-bit FNV-1a hash of the input string.
 * 
 * This implementation uses the Fowler-Noll-Vo hash function (FNV-1a variant)
 * to generate a deterministic unsigned 32-bit integer hash from a string.
 * 
 * @param s - The string to hash
 * @returns An unsigned 32-bit integer hash value
 * 
 * @remarks
 * The function uses `charCodeAt()` for performance with BMP characters.
 * For strings containing surrogate pairs or non-BMP characters,
 * consider using `codePointAt()` for proper Unicode handling.
 * 
 * @example
 * ```typescript
 * const hash = hashString32("hello");
 * console.log(hash); // 1335831723
 * ```
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
 * Generates a placeholder default value for a given export field based on its characteristics.
 * 
 * @param r - The export field seed row containing field metadata including name, length, and value specification
 * @returns A placeholder string appropriate for the field type:
 *   - First enum code value for enum or enum_yn fields
 *   - "20000101" for date_yyyymmdd fields
 *   - "0000000000" for dodid10 fields
 *   - "unknown@example.mil" for email fields
 *   - Random alphanumeric string (up to 12 characters) for other field types
 * 
 * @remarks
 * The random string generation uses a seeded RNG based on the field name and values specification
 * to ensure deterministic results for the same field configuration.
 */
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

/**
 * Determines the appropriate data transformation string for a given export field.
 * 
 * @param r - The export field seed row containing field metadata and value specifications
 * @returns A transformation string indicating how the field value should be processed:
 *   - `"trim|lower"` for email fields (applies trimming and lowercasing)
 *   - `"date:yyyymmdd"` for date fields in YYYYMMDD format
 *   - `"trim"` for all other field types (default transformation)
 * 
 * @remarks
 * The function applies the following logic:
 * 1. Checks if the field name contains "EMAIL" (case-insensitive)
 * 2. Checks if the domain type or analyzed kind indicates a YYYYMMDD date format
 * 3. Falls back to basic trimming for other field types
 */
function transformForField(r: ExportFieldSeedRow): string {
  const name = r.field_name.trim().toUpperCase();
  if (name.includes("EMAIL")) return "trim|lower";

  const analysis = classifyValuesSpec(r.field_name, r.values_spec_raw);
  if (r.domain_type === "DATE_YYYYMMDD" || analysis.kind === "date_yyyymmdd") {
    return "date:yyyymmdd";
  }
  return "trim";
}

/**
 * Builds a pre-alpha mapping rule for a given export field seed row, when a matching
 * preconfigured rule exists.
 *
 * This function normalizes the row's `field_name` (trimmed and uppercased), looks it up in
 * `PREALPHA_RULES`, and, if found, returns a `MappingRuleSeed` populated from both the input row
 * and the matched rule definition.
 *
 * @param r - The export field seed row used to resolve and construct a pre-alpha mapping rule.
 * @returns A `MappingRuleSeed` when a matching pre-alpha rule is found; otherwise `null`.
 */
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

/**
 * Builds a mapping rule seed based on the export field specification row.
 * 
 * This function determines the appropriate mapping rule configuration by analyzing
 * the field name and available metadata. It handles special cases for FORM_TYPE and
 * FORM_VERSION fields, checks for predefined column rules, processes question codes,
 * and falls back to literal constants or placeholders.
 * 
 * @param r - The export field seed row containing field metadata, specifications,
 *            and question codes used to construct the mapping rule
 * 
 * @returns A MappingRuleSeed object with the appropriate source expression,
 *          transform pipeline, default value, and metadata flags
 * 
 * @remarks
 * The function follows this precedence order:
 * 1. Special handling for FORM_TYPE and FORM_VERSION (literal or observed values)
 * 2. Predefined column rules from SPEC_COLUMN_RULES
 * 3. Question-based responses using question_code
 * 4. Literal constants extracted from values_spec_raw
 * 5. Placeholder constants as a fallback
 */
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

/**
 * Builds a mapping rule preview from the provided export field mapping preview input.
 * 
 * This function creates a temporary export field seed row with a "PREVIEW" ID and uses
 * it to generate a specification rule through `buildSpecRule`. The resulting rule is
 * then transformed into a preview format containing only the essential mapping properties.
 * 
 * @param input - The export field mapping preview input containing field configuration details
 * @param input.field_name - The name of the field being mapped
 * @param input.question_code - The code identifying the source question
 * @param input.field_length - The expected length of the field
 * @param input.values_spec_raw - The raw specification for allowed values
 * @param input.domain_type - The type of domain this field belongs to
 * 
 * @returns A mapping rule preview object containing the source expression, transform pipeline,
 *          default value, padding rule, and flags indicating if the field is literal or placeholder
 */
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

/**
 * Determines the source class of a mapping source string.
 * @param src - The source string to classify
 * @returns The source class key: "COL" for column sources, "RESP" for response sources, or "CONST" for constant sources
 */
function sourceClassOf(src: string): keyof MappingSourceCounts {
  if (src.startsWith("COL:")) return "COL";
  if (src.startsWith("RESP:")) return "RESP";
  return "CONST";
}

/**
 * Derives unique specification response fields from an array of export field seed rows.
 * 
 * This function processes export field seed rows and extracts unique response field specifications
 * by combining question codes with field names. Duplicate entries (based on question_code and field_name)
 * are automatically filtered out.
 * 
 * @param rows - An array of export field seed rows to process
 * @returns An array of unique specification response fields containing question code, field name,
 *          field length, domain type, and raw values specification
 * 
 * @remarks
 * - Rows with empty or undefined question codes are skipped
 * - Question codes are trimmed of whitespace before processing
 * - Uniqueness is determined by the combination of question_code and field_name
 * - The first occurrence of each unique question_code/field_name pair is preserved
 */
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

/**
 * Loads seed rows for export field mapping from the database.
 * 
 * Queries the EXPORT_FIELD table joined with VALUE_DOMAIN to retrieve field specifications
 * for a given export specification ID. Results are ordered by field_order.
 * 
 * @param pool - The database connection pool to execute the query against
 * @param exportSpecId - The unique identifier of the export specification to load fields for
 * @returns A promise that resolves to an array of ExportFieldSeedRow objects containing
 *          field metadata including field ID, name, question code, length, value specs, and domain type
 * @throws May throw database connection or query execution errors
 */
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

/**
 * Extracts a form-level value (FORM_TYPE or FORM_VERSION) from an array of export field seed rows.
 * 
 * @param rows - Array of export field seed rows to search through
 * @param fieldName - The specific field name to search for, either "FORM_TYPE" or "FORM_VERSION"
 * @returns The extracted literal constant value from the matching row's values_spec_raw, or undefined if not found
 * 
 * @remarks
 * This function performs a case-insensitive search for the specified field name and extracts
 * its value using the `extractLiteralConstant` helper function.
 */
function formValueFromRows(rows: ExportFieldSeedRow[], fieldName: "FORM_TYPE" | "FORM_VERSION"): string | undefined {
  const found = rows.find((r) => r.field_name.trim().toUpperCase() === fieldName);
  if (!found) return undefined;
  return extractLiteralConstant(found.values_spec_raw);
}

/**
 * Ensures a mapping set exists for the specified export specification and profile.
 * 
 * If a mapping set with the given export specification ID and mapping version already exists,
 * it updates the mapping name and form version observed. Otherwise, it creates a new mapping set.
 * 
 * @param pool - The database connection pool to execute queries against
 * @param exportSpecId - The unique identifier of the export specification
 * @param profile - The mapping profile type ("prealpha" or other), which determines the mapping version and name
 * @param formVersionObserved - The version of the form being observed/mapped
 * @returns A promise that resolves to the mapping set ID (either existing or newly created)
 * 
 * @remarks
 * - For "prealpha" profile: mapping_version = 1, mapping_name = "prealpha_20"
 * - For other profiles: mapping_version = 2, mapping_name = "spec_auto"
 * - Uses the most recently created mapping set if multiple exist with the same criteria
 */
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

/**
 * Rebuilds mapping rules for a specific mapping set by deleting existing rules
 * and inserting new ones from the provided seed data.
 * 
 * @param pool - The database connection pool to execute queries against
 * @param mappingSetId - The unique identifier of the mapping set to rebuild rules for
 * @param rules - An array of mapping rule seed objects containing the configuration
 *                for each rule to be inserted
 * 
 * @remarks
 * This function performs a complete replacement of rules:
 * 1. First deletes all existing rules associated with the mapping set
 * 2. Then inserts each rule from the provided array with a new generated UUID
 * 
 * Each rule contains fields for source expression, transform pipeline, default value,
 * and padding rules that define how data should be mapped and transformed.
 * 
 * @returns A promise that resolves when all rules have been deleted and re-inserted
 */
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

/**
 * Ensures a mapping set exists for the given profile and builds mapping rules from seed data.
 * 
 * This function loads seed rows for the specified export spec, determines form type and version,
 * ensures a mapping set is created or retrieved, builds mapping rules based on the profile type,
 * and calculates statistics about the mapping sources and field types.
 * 
 * @param pool - Database connection pool for executing queries
 * @param exportSpecId - Unique identifier for the export specification
 * @param profile - Mapping profile type ("spec" or "prealpha") that determines rule building strategy
 * 
 * @returns A promise that resolves to a {@link MappingProfileBuildResult} containing:
 * - `mapping_set_id`: The ID of the created or existing mapping set
 * - `source_counts`: Count of mapping sources by type (COL, RESP, CONST)
 * - `literal_field_count`: Number of literal fields in the mapping
 * - `placeholder_field_count`: Number of placeholder fields in the mapping
 * - `rule_count`: Total number of mapping rules created
 * - `form_type_observed`: The form type extracted from seed data or legacy default
 * - `form_version_observed`: The form version extracted from seed data or legacy default
 * - `spec_response_fields`: Derived specification response fields from seed rows
 * 
 * @remarks
 * - For "spec" profile, form type and version are extracted from seed rows or use legacy defaults
 * - For "prealpha" profile, legacy form type and version are always used
 * - Rules are rebuilt completely, replacing any existing rules for the mapping set
 */
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
