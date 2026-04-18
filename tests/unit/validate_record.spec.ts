import { test, expect } from "@playwright/test";
import { validateRecord } from "../../features/validate/validate_part_01_rules_engine";
import type { WriterFieldPlan } from "../../features/mapping/mapping_compile_part_02_build_writer_plan";

test.describe("validateRecord", () => {
  test("allows blank padded domain values when length is correct", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "DODID",
        start_pos: 1,
        length: 10,
        domain_type: "DODID10",
        getValue: () => "", // unused
      },
      {
        field_name: "DATE",
        start_pos: 11,
        length: 8,
        domain_type: "DATE_YYYYMMDD",
        getValue: () => "", // unused
      },
    ];

    const errs = validateRecord(
      1,
      plan,
      new Map([
        ["DODID", " ".repeat(10)],
        ["DATE", " ".repeat(8)],
      ])
    );

    expect(errs).toHaveLength(0);
  });

  test("flags length mismatches", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "X",
        start_pos: 1,
        length: 5,
        domain_type: null,
        getValue: () => "", // unused
      },
    ];

    const values = new Map<string, string>([["X", "AB"]]);
    const errs = validateRecord(1, plan, values);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.error_code).toBe("LEN_MISMATCH");
  });

  test("validates DODID10", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "DODID",
        start_pos: 1,
        length: 10,
        domain_type: "DODID10",
        getValue: () => "", // unused
      },
    ];

    const good = validateRecord(1, plan, new Map([["DODID", "1234567890"]]));
    expect(good).toHaveLength(0);

    const bad = validateRecord(1, plan, new Map([["DODID", "ABCDEF1234"]]));
    expect(bad).toHaveLength(1);
    expect(bad[0]!.error_code).toBe("BAD_DODID10");
  });

  test("validates DATE_YYYYMMDD", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "DATE",
        start_pos: 1,
        length: 8,
        domain_type: "DATE_YYYYMMDD",
        getValue: () => "", // unused
      },
    ];

    const good = validateRecord(1, plan, new Map([["DATE", "20260214"]]));
    expect(good).toHaveLength(0);

    const bad = validateRecord(1, plan, new Map([["DATE", "2026AB14"]]));
    expect(bad).toHaveLength(1);
    expect(bad[0]!.error_code).toBe("BAD_DATE");
  });

  test("prioritizes LEN_MISMATCH over domain checks when value length is wrong", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "DODID",
        start_pos: 1,
        length: 10,
        domain_type: "DODID10",
        getValue: () => "", // unused
      },
    ];

    const bad = validateRecord(1, plan, new Map([["DODID", "ABC"]]));
    expect(bad).toHaveLength(1);
    expect(bad[0]!.error_code).toBe("LEN_MISMATCH");
  });
});
