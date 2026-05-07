import { test, expect } from "@playwright/test";

import { validateRecord, type Application3ValidationField } from "../../Application/03/src/validation.js";

test.describe("Application 3 validateRecord", () => {
  test("allows blank padded domain values when length is correct", () => {
    const fields: Application3ValidationField[] = [
      {
        field_name: "DODID",
        length: 10,
        domain_type: "DODID10"
      },
      {
        field_name: "DATE",
        length: 8,
        domain_type: "DATE_YYYYMMDD"
      }
    ];

    const errors = validateRecord(
      1,
      fields,
      new Map([
        ["DODID", " ".repeat(10)],
        ["DATE", " ".repeat(8)]
      ])
    );

    expect(errors).toHaveLength(0);
  });

  test("flags length mismatches", () => {
    const fields: Application3ValidationField[] = [
      {
        field_name: "X",
        length: 5,
        domain_type: null
      }
    ];

    expect(validateRecord(1, fields, new Map([["X", "AB"]]))).toEqual([
      {
        record_ordinal: 1,
        export_field_name: "X",
        error_code: "LEN_MISMATCH",
        expected: "5",
        actual: "2",
        message: "Expected padded value length 5, got 2"
      }
    ]);
  });

  test("validates DODID10 values", () => {
    const fields: Application3ValidationField[] = [
      {
        field_name: "DODID",
        length: 10,
        domain_type: "DODID10"
      }
    ];

    expect(validateRecord(1, fields, new Map([["DODID", "1234567890"]]))).toHaveLength(0);
    expect(validateRecord(1, fields, new Map([["DODID", "ABCDEF1234"]]))).toEqual([
      {
        record_ordinal: 1,
        export_field_name: "DODID",
        error_code: "BAD_DODID10",
        expected: "10 digits",
        actual: "ABCDEF1234",
        message: "DoD ID must be 10 digits"
      }
    ]);
  });

  test("validates DATE_YYYYMMDD values", () => {
    const fields: Application3ValidationField[] = [
      {
        field_name: "DATE",
        length: 8,
        domain_type: "DATE_YYYYMMDD"
      }
    ];

    expect(validateRecord(1, fields, new Map([["DATE", "20260214"]]))).toHaveLength(0);
    expect(validateRecord(1, fields, new Map([["DATE", "2026AB14"]]))).toEqual([
      {
        record_ordinal: 1,
        export_field_name: "DATE",
        error_code: "BAD_DATE",
        expected: "YYYYMMDD",
        actual: "2026AB14",
        message: "Date must be YYYYMMDD"
      }
    ]);
  });

  test("prioritizes LEN_MISMATCH over domain checks when value length is wrong", () => {
    const fields: Application3ValidationField[] = [
      {
        field_name: "DODID",
        length: 10,
        domain_type: "DODID10"
      }
    ];

    expect(validateRecord(1, fields, new Map([["DODID", "ABC"]]))).toEqual([
      {
        record_ordinal: 1,
        export_field_name: "DODID",
        error_code: "LEN_MISMATCH",
        expected: "10",
        actual: "3",
        message: "Expected padded value length 10, got 3"
      }
    ]);
  });

  test("ignores unknown domain types when length is correct", () => {
    const fields: Application3ValidationField[] = [
      {
        field_name: "UNKNOWN",
        length: 3,
        domain_type: "UNSUPPORTED"
      }
    ];

    expect(validateRecord(1, fields, new Map([["UNKNOWN", "ABC"]]))).toHaveLength(0);
  });
});
