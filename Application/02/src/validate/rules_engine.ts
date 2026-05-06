import type { Application2WriterFieldPlan } from "../mapping/build_writer_plan.js";

export type Application2ValidationErrorRow = {
  record_ordinal: number;
  export_field_name: string;
  error_code: string;
  expected: string | null;
  actual: string | null;
  message: string;
};

function isBlank(v: string | null | undefined) {
  if (v == null) {
    console.warn("isBlank received null or undefined; this should not happen in a well-formed export");
    return true;
  }
  return v.trim().length === 0;
}

export function validateRecord(
  recordOrdinal: number,
  plan: Application2WriterFieldPlan[],
  values: Map<string, string>
): Application2ValidationErrorRow[] {
  const errors: Application2ValidationErrorRow[] = [];

  for (const field of plan) {
    const value = values.get(field.field_name) ?? "";
    if (value.length !== field.length) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: field.field_name,
        error_code: "LEN_MISMATCH",
        expected: String(field.length),
        actual: String(value.length),
        message: `Expected padded value length ${field.length}, got ${value.length}`
      });
      continue;
    }

    if (!field.domain_type) continue;
    const domainType = field.domain_type;

    if (domainType === "DODID10" && !isBlank(value) && !/^\d{10}$/.test(value.trim())) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: field.field_name,
        error_code: "BAD_DODID10",
        expected: "10 digits",
        actual: value.trim(),
        message: "DoD ID must be 10 digits"
      });
    }

    if (domainType === "DATE_YYYYMMDD" && !isBlank(value) && !/^\d{8}$/.test(value.trim())) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: field.field_name,
        error_code: "BAD_DATE",
        expected: "YYYYMMDD",
        actual: value.trim(),
        message: "Date must be YYYYMMDD"
      });
    }
  }

  return errors;
}
