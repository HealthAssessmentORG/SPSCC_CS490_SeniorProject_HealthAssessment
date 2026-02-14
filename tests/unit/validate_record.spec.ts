import { test, expect } from "@playwright/test";
import { validateRecord } from "../../features/validate/validate_part_01_rules_engine";
import type { WriterFieldPlan } from "../../features/mapping/mapping_compile_part_02_build_writer_plan";

test.describe("validateRecord", () => {
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

    const bad = validateRecord(1, plan, new Map([["DATE", "2026-02-14"]]));
    expect(bad).toHaveLength(1);
    expect(bad[0]!.error_code).toBe("BAD_DATE");
  });
});
