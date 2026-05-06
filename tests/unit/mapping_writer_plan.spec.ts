import { test, expect } from "@playwright/test";
import {
  buildWriterPlan,
  type ExportField,
  type RecordContext,
} from "../../features/mapping/mapping_compile_part_02_build_writer_plan.js";
import type { ParsedRule } from "../../features/mapping/mapping_compile_part_01_parse_rules.js";

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
  test("unmapped fields resolve to fixed-width blanks", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F0",
        field_name: "UNMAPPED",
        start_pos: 1,
        end_pos: 6,
        field_length: 6,
        domain_type: null,
      },
    ];

    const plan = buildWriterPlan(fields, new Map());
    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map(),
    };

    expect(plan[0]!.getValue(ctx)).toBe("      ");
  });

  test("missing RESP source falls back to default value and padding", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F0",
        field_name: "MISSING_RESPONSE",
        start_pos: 1,
        end_pos: 10,
        field_length: 10,
        domain_type: null,
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F0",
        mkRule({
          export_field_id: "F0",
          source: { kind: "resp", question_code: "CAM", field_name: "MISSING_RESPONSE" },
          transforms: [{ kind: "trim" }],
          pad: { kind: "right_space" },
          default_value: "DEFAULT",
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map(),
    };

    expect(plan[0]!.getValue(ctx)).toBe("DEFAULT   ");
  });

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

  test("COL sources read ASSESSMENT and DEPLOYER values", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F_ASSESSMENT_DATE",
        field_name: "EVENT_DATE",
        start_pos: 1,
        end_pos: 8,
        field_length: 8,
        domain_type: "DATE_YYYYMMDD",
      },
      {
        export_field_id: "F_DEPLOYER_ID",
        field_name: "DODID",
        start_pos: 9,
        end_pos: 18,
        field_length: 10,
        domain_type: "DODID10",
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F_ASSESSMENT_DATE",
        mkRule({
          export_field_id: "F_ASSESSMENT_DATE",
          source: { kind: "col", table: "ASSESSMENT", column: "event_date" },
          transforms: [{ kind: "date_yyyymmdd" }],
          pad: { kind: "right_space" },
        }),
      ],
      [
        "F_DEPLOYER_ID",
        mkRule({
          export_field_id: "F_DEPLOYER_ID",
          source: { kind: "col", table: "DEPLOYER", column: "dod_id" },
          transforms: [{ kind: "trim" }],
          pad: { kind: "right_space" },
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: { event_date: "2026-02-14T00:00:00.000Z" },
      deployer: { dod_id: "1234567890" },
      provider_review: {},
      responses: new Map(),
    };

    expect(plan[0]!.getValue(ctx)).toBe("20260214");
    expect(plan[1]!.getValue(ctx)).toBe("1234567890");
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

  test("overlong mapped values are truncated to field length", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F_LONG",
        field_name: "LONG_VALUE",
        start_pos: 1,
        end_pos: 5,
        field_length: 5,
        domain_type: null,
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F_LONG",
        mkRule({
          export_field_id: "F_LONG",
          source: { kind: "resp", question_code: "DEM", field_name: "LONG_VALUE" },
          transforms: [{ kind: "trim" }],
          pad: { kind: "right_space" },
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map([["DEM:LONG_VALUE", " ABCDEFGHI "]]),
    };

    expect(plan[0]!.getValue(ctx)).toBe("ABCDE");
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

  test("CONST source uses default value", () => {
    const fields: ExportField[] = [
      {
        export_field_id: "F4",
        field_name: "FORM_TYPE",
        start_pos: 1,
        end_pos: 5,
        field_length: 5,
        domain_type: null,
      },
    ];

    const rules = new Map<string, ParsedRule>([
      [
        "F4",
        mkRule({
          export_field_id: "F4",
          source: { kind: "const" },
          transforms: [{ kind: "trim" }],
          pad: { kind: "right_space" },
          default_value: "CAM",
        }),
      ],
    ]);

    const plan = buildWriterPlan(fields, rules);
    const ctx: RecordContext = {
      assessment: {},
      deployer: {},
      provider_review: {},
      responses: new Map(),
    };

    const v = plan[0]!.getValue(ctx);
    expect(v).toBe("CAM  ");
  });
});
