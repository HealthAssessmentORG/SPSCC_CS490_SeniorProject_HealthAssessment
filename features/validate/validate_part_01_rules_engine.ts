import { WriterFieldPlan } from "../mapping/mapping_compile_part_02_build_writer_plan";

/**
 * Represents a validation error for a record in a data export.
 * 
 * @typedef {Object} ValidationErrorRow
 * @property {number} record_ordinal - The ordinal position of the record that failed validation (1-based index).
 * @property {string} export_field_name - The name of the field in the export that caused the validation error.
 * @property {string} error_code - The unique code identifying the type of validation error.
 * @property {string | null} expected - The expected value for the field, or null if not applicable.
 * @property {string | null} actual - The actual value found in the field, or null if not applicable.
 * @property {string} message - A human-readable description of the validation error.
 */
export type ValidationErrorRow = {
  record_ordinal: number;
  export_field_name: string;
  error_code: string;
  expected: string | null;
  actual: string | null;
  message: string;
};

/**
 * Checks if a string is blank (empty or contains only whitespace).
 * @param v - The string to check
 * @returns `true` if the string is blank, `false` otherwise
 */
function isBlank(v: string | null | undefined) {
  if (v == null) {
    console.warn("isBlank received null or undefined; this should not happen in a well-formed export");
    return true;
  }
  return v.trim().length === 0;
}

/**
 * Validates a record against a field plan, checking for length mismatches and domain type violations.
 * @param recordOrdinal - The ordinal position of the record being validated
 * @param plan - Array of field definitions specifying expected lengths and domain types
 * @param values - Map of field names to their string values
 * @returns Array of validation errors found, empty if record is valid
 */
export function validateRecord(
  recordOrdinal: number,
  plan: WriterFieldPlan[],
  values: Map<string, string>
): ValidationErrorRow[] {
  const errors: ValidationErrorRow[] = [];

  for (const f of plan) {
    const v = values.get(f.field_name) ?? "";
    if (v.length !== f.length) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: f.field_name,
        error_code: "LEN_MISMATCH",
        expected: String(f.length),
        actual: String(v.length),
        message: `Expected padded value length ${f.length}, got ${v.length}`
      });
      continue;
    }

    if (!f.domain_type) continue;
    const dt = f.domain_type;

    if (dt === "DODID10" && !isBlank(v) && !/^\d{10}$/.test(v.trim())) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: f.field_name,
        error_code: "BAD_DODID10",
        expected: "10 digits",
        actual: v.trim(),
        message: "DoD ID must be 10 digits"
      });
    }

    if (dt === "DATE_YYYYMMDD" && !isBlank(v) && !/^\d{8}$/.test(v.trim())) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: f.field_name,
        error_code: "BAD_DATE",
        expected: "YYYYMMDD",
        actual: v.trim(),
        message: "Date must be YYYYMMDD"
      });
    }
  }

  return errors;
}
