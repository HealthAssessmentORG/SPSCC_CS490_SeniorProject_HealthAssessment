export type Application3ValidationField = {
  field_name: string;
  length: number;
  domain_type: string | null;
};

export type Application3ValidationErrorRow = {
  record_ordinal: number;
  export_field_name: string;
  error_code: string;
  expected: string | null;
  actual: string | null;
  message: string;
};

const DODID10_PATTERN = /^\d{10}$/;
const DATE_YYYYMMDD_PATTERN = /^\d{8}$/;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function validateRecord(
  recordOrdinal: number,
  fields: Application3ValidationField[],
  values: Map<string, string>
): Application3ValidationErrorRow[] {
  const errors: Application3ValidationErrorRow[] = [];

  for (const field of fields) {
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

    if (field.domain_type === "DODID10" && !isBlank(value) && !DODID10_PATTERN.test(value.trim())) {
      errors.push({
        record_ordinal: recordOrdinal,
        export_field_name: field.field_name,
        error_code: "BAD_DODID10",
        expected: "10 digits",
        actual: value.trim(),
        message: "DoD ID must be 10 digits"
      });
    }

    if (
      field.domain_type === "DATE_YYYYMMDD" &&
      !isBlank(value) &&
      !DATE_YYYYMMDD_PATTERN.test(value.trim())
    ) {
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
