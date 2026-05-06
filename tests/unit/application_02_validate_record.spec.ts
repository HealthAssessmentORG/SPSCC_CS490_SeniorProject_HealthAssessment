import { test, expect } from "@playwright/test";

import { validateRecord } from "../../Application/02/src/validate/rules_engine.js";
import type { Application2WriterFieldPlan } from "../../Application/02/src/mapping/build_writer_plan.js";

test.describe("Application 2 validateRecord", () => {
  test("allows blank padded domain values when length is correct", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "DODID",
        start_pos: 1,
        length: 10,
        domain_type: "DODID10",
        getValue: () => ""
      },
      {
        field_name: "DATE",
        start_pos: 11,
        length: 8,
        domain_type: "DATE_YYYYMMDD",
        getValue: () => ""
      }
    ];

    const errors = validateRecord(
      1,
      plan,
      new Map([
        ["DODID", " ".repeat(10)],
        ["DATE", " ".repeat(8)]
      ])
    );

    expect(errors).toHaveLength(0);
  });

  test("flags length mismatches with full payload", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "X",
        start_pos: 1,
        length: 5,
        domain_type: null,
        getValue: () => ""
      }
    ];

    expect(validateRecord(1, plan, new Map([["X", "AB"]]))).toEqual([
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

  test("validates DODID10 with full payload", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "DODID",
        start_pos: 1,
        length: 10,
        domain_type: "DODID10",
        getValue: () => ""
      }
    ];

    expect(validateRecord(1, plan, new Map([["DODID", "1234567890"]]))).toHaveLength(0);
    expect(validateRecord(1, plan, new Map([["DODID", "ABCDEF1234"]]))).toEqual([
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

  test("validates DATE_YYYYMMDD with full payload", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "DATE",
        start_pos: 1,
        length: 8,
        domain_type: "DATE_YYYYMMDD",
        getValue: () => ""
      }
    ];

    expect(validateRecord(1, plan, new Map([["DATE", "20260214"]]))).toHaveLength(0);
    expect(validateRecord(1, plan, new Map([["DATE", "2026AB14"]]))).toEqual([
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
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "DODID",
        start_pos: 1,
        length: 10,
        domain_type: "DODID10",
        getValue: () => ""
      }
    ];

    expect(validateRecord(1, plan, new Map([["DODID", "ABC"]]))).toEqual([
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
});
