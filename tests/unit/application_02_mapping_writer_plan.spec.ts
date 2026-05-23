import { test, expect } from "@playwright/test";

import {
  buildParsedRuleMap,
  buildWriterPlan
} from "../../Application/02/src/mapping/build_writer_plan.js";
import {
  parsePadRule,
  parseSourceExpression,
  parseTransformPipeline
} from "../../Application/02/src/mapping/parse_rules.js";
import type {
  Application2ExportFieldRow,
  Application2RawMappingRuleRow,
  Application2RecordContext
} from "../../Application/02/src/types.js";

function ctx(overrides: Partial<Application2RecordContext> = {}): Application2RecordContext {
  return {
    assessment: {},
    deployer: {},
    provider_review: {},
    responses: new Map(),
    ...overrides
  };
}

test.describe("Application 2 mapping rule parsing", () => {
  test("parses source expressions, transform pipelines, and pad rules", () => {
    expect(parseSourceExpression("CONST")).toEqual({ kind: "const" });
    expect(parseSourceExpression("COL:ASSESSMENT.event_date")).toEqual({
      kind: "col",
      table: "ASSESSMENT",
      column: "event_date"
    });
    expect(parseSourceExpression("RESP:DEM:EMAIL")).toEqual({
      kind: "resp",
      question_code: "DEM",
      field_name: "EMAIL"
    });
    expect(parseSourceExpression("RESP_FIELD:EMAIL")).toEqual({
      kind: "resp_field",
      field_name: "EMAIL"
    });
    expect(parseTransformPipeline("trim|lower|date:yyyymmdd").map((op) => op.kind)).toEqual([
      "trim",
      "lower",
      "date_yyyymmdd"
    ]);
    expect(parsePadRule(null)).toEqual({ kind: "none" });
    expect(parsePadRule("pad:right:space")).toEqual({ kind: "right_space" });
    expect(parsePadRule("pad:left:0")).toEqual({ kind: "left_zero" });
  });

  test("throws on malformed rules", () => {
    expect(() => parseSourceExpression("COL:ASSESSMENT")).toThrow("Bad COL source_expression");
    expect(() => parseSourceExpression("RESP:DEM")).toThrow("Bad RESP source_expression");
    expect(() => parseSourceExpression("RESP:DEM:EMAIL:EXTRA")).toThrow("Bad RESP source_expression");
    expect(() => parseSourceExpression("RESP_FIELD:")).toThrow("Bad RESP_FIELD source_expression");
    expect(() => parseSourceExpression("RESP_FIELD:DEM:EMAIL")).toThrow(
      "Bad RESP_FIELD source_expression"
    );
    expect(() => parseSourceExpression("WAT:???")).toThrow("Unknown source_expression");
    expect(() => parseTransformPipeline("trim|wut")).toThrow("Unknown transform op: wut");
  });
});

test.describe("Application 2 writer plan", () => {
  test("builds parsed rules from raw repository rows without DB access", () => {
    const rawRules: Application2RawMappingRuleRow[] = [
      {
        export_field_id: "F_EMAIL",
        source_expression: "RESP:DEM:EMAIL",
        transform_pipeline: "trim|lower",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_DOB",
        source_expression: "RESP_FIELD:DOB",
        transform_pipeline: "date:yyyymmdd",
        default_value: null,
        pad_rule: "pad:right:space"
      }
    ];

    const rules = buildParsedRuleMap(rawRules);

    expect(rules.get("F_EMAIL")).toMatchObject({
      export_field_id: "F_EMAIL",
      source: { kind: "resp", question_code: "DEM", field_name: "EMAIL" },
      transforms: [{ kind: "trim" }, { kind: "lower" }],
      pad: { kind: "right_space" },
      default_value: ""
    });
    expect(rules.get("F_DOB")).toMatchObject({
      export_field_id: "F_DOB",
      source: { kind: "resp_field", field_name: "DOB" },
      transforms: [{ kind: "date_yyyymmdd" }],
      pad: { kind: "right_space" },
      default_value: ""
    });
  });

  test("unmapped fields resolve to fixed-width blanks", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F0",
        field_name: "UNMAPPED",
        start_pos: 1,
        end_pos: 6,
        field_length: 6,
        domain_type: null
      }
    ];

    const plan = buildWriterPlan(fields, new Map());

    expect(plan[0]!.getValue(ctx())).toBe("      ");
  });

  test("missing RESP source falls back to default value and padding", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F0",
        field_name: "MISSING_RESPONSE",
        start_pos: 1,
        end_pos: 10,
        field_length: 10,
        domain_type: null
      }
    ];

    const rules = buildParsedRuleMap([
      {
        export_field_id: "F0",
        source_expression: "RESP:CAM:MISSING_RESPONSE",
        transform_pipeline: "trim",
        default_value: "DEFAULT",
        pad_rule: "pad:right:space"
      }
    ]);

    const plan = buildWriterPlan(fields, rules);

    expect(plan[0]!.getValue(ctx())).toBe("DEFAULT   ");
  });

  test("COL sources read ASSESSMENT, DEPLOYER, and PROVIDER_REVIEW values", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F_EVENT_DATE",
        field_name: "EVENT_DATE",
        start_pos: 1,
        end_pos: 8,
        field_length: 8,
        domain_type: "DATE_YYYYMMDD"
      },
      {
        export_field_id: "F_DODID",
        field_name: "DODID",
        start_pos: 9,
        end_pos: 18,
        field_length: 10,
        domain_type: "DODID10"
      },
      {
        export_field_id: "F_CERTIFY_DATE",
        field_name: "CERTIFY_DATE",
        start_pos: 19,
        end_pos: 26,
        field_length: 8,
        domain_type: "DATE_YYYYMMDD"
      }
    ];

    const rules = buildParsedRuleMap([
      {
        export_field_id: "F_EVENT_DATE",
        source_expression: "COL:ASSESSMENT.event_date",
        transform_pipeline: "date:yyyymmdd",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_DODID",
        source_expression: "COL:DEPLOYER.dod_id",
        transform_pipeline: "trim",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_CERTIFY_DATE",
        source_expression: "COL:PROVIDER_REVIEW.certify_date",
        transform_pipeline: "date:yyyymmdd",
        default_value: null,
        pad_rule: "pad:right:space"
      }
    ]);

    const plan = buildWriterPlan(fields, rules);
    const recordContext = ctx({
      assessment: { event_date: "2026-02-14T00:00:00.000Z" },
      deployer: { dod_id: "1234567890" },
      provider_review: { certify_date: new Date("2026-02-15T12:34:56.000Z") }
    });

    expect(plan[0]!.getValue(recordContext)).toBe("20260214");
    expect(plan[1]!.getValue(recordContext)).toBe("1234567890");
    expect(plan[2]!.getValue(recordContext)).toBe("20260215");
  });

  test("RESP sources apply trim/lower, truncation, and padding", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F_EMAIL",
        field_name: "EMAIL",
        start_pos: 1,
        end_pos: 20,
        field_length: 20,
        domain_type: null
      },
      {
        export_field_id: "F_LONG",
        field_name: "LONG_VALUE",
        start_pos: 21,
        end_pos: 25,
        field_length: 5,
        domain_type: null
      }
    ];

    const rules = buildParsedRuleMap([
      {
        export_field_id: "F_EMAIL",
        source_expression: "RESP:DEM:EMAIL",
        transform_pipeline: "trim|lower",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_LONG",
        source_expression: "RESP:DEM:LONG_VALUE",
        transform_pipeline: "trim",
        default_value: null,
        pad_rule: "pad:right:space"
      }
    ]);

    const plan = buildWriterPlan(fields, rules);
    const recordContext = ctx({
      responses: new Map([
        ["DEM:EMAIL", "  TeSt@EXAMPLE.com  "],
        ["DEM:LONG_VALUE", " ABCDEFGHI "]
      ])
    });

    expect(plan[0]!.getValue(recordContext)).toBe("test@example.com".padEnd(20, " "));
    expect(plan[1]!.getValue(recordContext)).toBe("ABCDE");
  });

  test("RESP_FIELD sources use field_name while legacy RESP sources still work", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F_EMAIL",
        field_name: "EMAIL",
        start_pos: 1,
        end_pos: 18,
        field_length: 18,
        domain_type: null
      },
      {
        export_field_id: "F_LNAME",
        field_name: "LNAME",
        start_pos: 19,
        end_pos: 28,
        field_length: 10,
        domain_type: null
      }
    ];

    const rules = buildParsedRuleMap([
      {
        export_field_id: "F_EMAIL",
        source_expression: "RESP_FIELD:EMAIL",
        transform_pipeline: "trim|lower",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_LNAME",
        source_expression: "RESP:DEM:LNAME",
        transform_pipeline: "trim",
        default_value: null,
        pad_rule: "pad:right:space"
      }
    ]);

    const plan = buildWriterPlan(fields, rules);
    const recordContext = ctx({
      responses: new Map([
        ["EMAIL", " User@EXAMPLE.MIL "],
        ["DEM:LNAME", " Smith "]
      ])
    });

    expect(plan[0]!.getValue(recordContext)).toBe("user@example.mil  ");
    expect(plan[1]!.getValue(recordContext)).toBe("Smith     ");
  });

  test("representative seeded fields resolve constants, columns, responses, dates, enums, and defaults", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F_FORM_TYPE",
        field_name: "FORM_TYPE",
        start_pos: 1,
        end_pos: 5,
        field_length: 5,
        domain_type: null
      },
      {
        export_field_id: "F_DODID",
        field_name: "DODID",
        start_pos: 6,
        end_pos: 15,
        field_length: 10,
        domain_type: "DODID10"
      },
      {
        export_field_id: "F_D_EVENT",
        field_name: "D_EVENT",
        start_pos: 16,
        end_pos: 23,
        field_length: 8,
        domain_type: "DATE_YYYYMMDD"
      },
      {
        export_field_id: "F_EMAIL",
        field_name: "EMAIL",
        start_pos: 24,
        end_pos: 43,
        field_length: 20,
        domain_type: null
      },
      {
        export_field_id: "F_SEX",
        field_name: "SEX",
        start_pos: 44,
        end_pos: 44,
        field_length: 1,
        domain_type: "ENUM_SEX"
      },
      {
        export_field_id: "F_PROVIDER_TITLE",
        field_name: "PROVIDER_TITLE",
        start_pos: 45,
        end_pos: 45,
        field_length: 1,
        domain_type: "ENUM_PROV_TITLE"
      }
    ];

    const rules = buildParsedRuleMap([
      {
        export_field_id: "F_FORM_TYPE",
        source_expression: "CONST",
        transform_pipeline: "trim",
        default_value: "PRE",
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_DODID",
        source_expression: "COL:DEPLOYER.dod_id",
        transform_pipeline: "trim",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_D_EVENT",
        source_expression: "COL:ASSESSMENT.event_date",
        transform_pipeline: "date:yyyymmdd",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_EMAIL",
        source_expression: "RESP_FIELD:EMAIL",
        transform_pipeline: "trim|lower",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_SEX",
        source_expression: "RESP_FIELD:SEX",
        transform_pipeline: "trim",
        default_value: null,
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_PROVIDER_TITLE",
        source_expression: "COL:PROVIDER_REVIEW.provider_title",
        transform_pipeline: "trim",
        default_value: "1",
        pad_rule: "pad:right:space"
      }
    ]);

    const plan = buildWriterPlan(fields, rules);
    const recordContext = ctx({
      assessment: { event_date: "2026-05-24T00:00:00.000Z" },
      deployer: { dod_id: "1234567890" },
      provider_review: {},
      responses: new Map([
        ["EMAIL", " Sailor@EXAMPLE.MIL "],
        ["SEX", "F"]
      ])
    });

    expect(plan.map((field) => field.getValue(recordContext))).toEqual([
      "PRE  ",
      "1234567890",
      "20260524",
      "sailor@example.mil  ",
      "F",
      "1"
    ]);
  });

  test("CONST source and left-zero padding preserve current behavior", () => {
    const fields: Application2ExportFieldRow[] = [
      {
        export_field_id: "F_FORM_TYPE",
        field_name: "FORM_TYPE",
        start_pos: 1,
        end_pos: 5,
        field_length: 5,
        domain_type: null
      },
      {
        export_field_id: "F_CODE",
        field_name: "CODE",
        start_pos: 6,
        end_pos: 8,
        field_length: 3,
        domain_type: null
      }
    ];

    const rules = buildParsedRuleMap([
      {
        export_field_id: "F_FORM_TYPE",
        source_expression: "CONST",
        transform_pipeline: "trim",
        default_value: "CAM",
        pad_rule: "pad:right:space"
      },
      {
        export_field_id: "F_CODE",
        source_expression: "COL:ASSESSMENT.code",
        transform_pipeline: "trim",
        default_value: null,
        pad_rule: "pad:left:0"
      }
    ]);

    const plan = buildWriterPlan(fields, rules);

    expect(plan[0]!.getValue(ctx())).toBe("CAM  ");
    expect(plan[1]!.getValue(ctx({ assessment: { code: "7" } }))).toBe("007");
  });
});
