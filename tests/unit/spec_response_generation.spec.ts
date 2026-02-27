import { expect, test } from "@playwright/test";
import {
  generateSpecResponseValue,
  SpecResponseSeedField,
} from "../../features/generator/generator_part_03_insert_responses";

function mkField(p: Partial<SpecResponseSeedField> & { field_name: string; question_code: string }): SpecResponseSeedField {
  return {
    field_name: p.field_name,
    question_code: p.question_code,
    field_length: p.field_length ?? 10,
    domain_type: p.domain_type ?? null,
    values_spec_raw: p.values_spec_raw ?? null,
  };
}

test.describe("spec response deterministic generation", () => {
  test("same seed+record+field yields same value", () => {
    const f = mkField({
      question_code: "CAM",
      field_name: "ID",
      field_length: 10,
      values_spec_raw: "9999999999",
      domain_type: "DODID10",
    });

    const a = generateSpecResponseValue(f, "2026-02-27", 123, 1);
    const b = generateSpecResponseValue(f, "2026-02-27", 123, 1);
    expect(a).toBe(b);
  });

  test("different record ordinal changes value", () => {
    const f = mkField({
      question_code: "CAM",
      field_name: "ID",
      field_length: 10,
      values_spec_raw: "9999999999",
      domain_type: "DODID10",
    });

    const a = generateSpecResponseValue(f, "2026-02-27", 123, 1);
    const b = generateSpecResponseValue(f, "2026-02-27", 123, 2);
    expect(a).not.toBe(b);
  });

  test("enum/date/numeric values are valid", () => {
    const enumField = mkField({
      question_code: "CAM",
      field_name: "OK",
      field_length: 1,
      values_spec_raw: "Y=Yes, N=No, U=Don't know",
    });
    const dateField = mkField({
      question_code: "CAM",
      field_name: "DOB",
      field_length: 8,
      values_spec_raw: "YYYYMMDD",
      domain_type: "DATE_YYYYMMDD",
    });
    const numField = mkField({
      question_code: "CAM",
      field_name: "ID",
      field_length: 10,
      values_spec_raw: "9999999999",
      domain_type: "DODID10",
    });

    const ev = generateSpecResponseValue(enumField, "2026-02-27", 123, 1);
    const dv = generateSpecResponseValue(dateField, "2026-02-27", 123, 1);
    const nv = generateSpecResponseValue(numField, "2026-02-27", 123, 1);

    expect(["Y", "N", "U"]).toContain(ev);
    expect(dv).toMatch(/^\d{8}$/);
    expect(nv).toMatch(/^\d{10}$/);
  });
});
