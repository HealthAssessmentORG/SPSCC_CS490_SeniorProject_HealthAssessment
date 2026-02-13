import { WriterFieldPlan } from "../mapping/mapping_compile_part_02_build_writer_plan";

export type ValidationErrorRow = {
  record_ordinal: number;
  export_field_name: string;
  error_code: string;
  expected: string | null;
  actual: string | null;
  message: string;
};

function isBlank(v: string) {
  return v.trim().length === 0;
}

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
