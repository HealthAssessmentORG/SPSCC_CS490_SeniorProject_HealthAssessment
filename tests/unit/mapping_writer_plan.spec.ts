import { test, expect } from "@playwright/test";
import {
  buildWriterPlan,
  type ExportField,
  type RecordContext,
} from "../../features/mapping/mapping_compile_part_02_build_writer_plan";
import type { ParsedRule } from "../../features/mapping/mapping_compile_part_01_parse_rules";

function mkRule(p: Partial<ParsedRule> & { export_field_id: string }): ParsedRule {
  return {
    export_field_id: p.export_field_id,
    source: p.source!,
    transforms: p.transforms ?? [],
    pad: p.pad ?? { kind: "none" },
    default_value: p.default_value ?? "",
  };
}

test.describe("writer plan getValue", () => {
  test("COL sources + date transform + right padding", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F1",
        field_name: "CERTIFY_DATE",
        start_pos: 1,
        end_pos: 8,
        field_length: 8,
        domain_type: "DATE_YYYYMMDD",
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F1",
        mkRule({
          export_field_id: "F1",
          source: { kind: "col", table: "PROVIDER_REVIEW", column: "certify_date" },
          transforms: [{ kind: "date_yyyymmdd" }],
          pad: { kind: "right_space" },
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: { certify_date: new Date("2026-02-14T12:34:56Z") },
      responses: new Map(),
    };

    const v = plan[0]!.getValue(ctx);
    expect(v).toBe("20260214");
  });

  test("RESP sources + trim/lower + right padding", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F2",
        field_name: "EMAIL",
        start_pos: 1,
        end_pos: 20,
        field_length: 20,
        domain_type: null,
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F2",
        mkRule({
          export_field_id: "F2",
          source: { kind: "resp", question_code: "DEM", field_name: "EMAIL" },
          transforms: [{ kind: "trim" }, { kind: "lower" }],
          pad: { kind: "right_space" },
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map([["DEM:EMAIL", "  TeSt@EXAMPLE.com  "]]),
    };

    const v = plan[0]!.getValue(ctx);
    expect(v).toBe("test@example.com".padEnd(20, " "));
  });

  test("left-zero padding", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F3",
        field_name: "CODE",
        start_pos: 1,
        end_pos: 3,
        field_length: 3,
        domain_type: null,
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F3",
        mkRule({
          export_field_id: "F3",
          source: { kind: "col", table: "ASSESSMENT", column: "code" },
          transforms: [{ kind: "trim" }],
          pad: { kind: "left_zero" },
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: { code: "7" },
      deployer: {},
      provider_review: {},
      responses: new Map(),
    };

    const v = plan[0]!.getValue(ctx);
    expect(v).toBe("007");
  });
});
