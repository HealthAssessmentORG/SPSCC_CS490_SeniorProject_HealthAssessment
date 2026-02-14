import { test, expect } from "@playwright/test";
import { buildFixedWidthLine } from "../../features/fixed_width/fixed_width_writer_part_01_place_fields";
import type {
  WriterFieldPlan,
  RecordContext,
} from "../../features/mapping/mapping_compile_part_02_build_writer_plan";

test.describe("buildFixedWidthLine", () => {
  test("places fields into the right positions (1-indexed)", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "A",
        start_pos: 2,
        length: 3,
        domain_type: null,
        getValue: () => "ABC",
      },
    ];

    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map(),
    };

    const { line, fieldValues } = buildFixedWidthLine(10, plan, ctx);
    expect(line).toBe(" " + "ABC" + " ".repeat(6));
    expect(fieldValues.get("A")).toBe("ABC");
  });

  test("later fields can overwrite earlier fields when overlapping", () => {
    const plan: WriterFieldPlan[] = [
      {
        field_name: "F1",
        start_pos: 1,
        length: 5,
        domain_type: null,
        getValue: () => "HELLO",
      },
      {
        field_name: "F2",
        start_pos: 4,
        length: 2,
        domain_type: null,
        getValue: () => "ZZ",
      },
    ];

    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map(),
    };

    const { line } = buildFixedWidthLine(6, plan, ctx);
    // HELLO
    // 12345
    // -> H E L Z Z _
    expect(line).toBe("HELZZ ");
  });
});
