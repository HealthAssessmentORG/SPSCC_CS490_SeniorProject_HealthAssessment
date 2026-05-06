import { expect, test } from "@playwright/test";
import { buildSpecRulePreview } from "../../features/mapping/mapping_seed_part_03_profiles.js";

test.describe("spec mapping profile rule builder", () => {
  test("locks representative exact spec rule previews", () => {
    expect(
      buildSpecRulePreview({
        field_name: "UNMAPPED_MISC",
        question_code: null,
        field_length: 8,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      })
    ).toEqual({
      source_expression: "CONST",
      transform_pipeline: "trim",
      default_value: "4HEBVQG8",
      pad_rule: "pad:right:space",
      is_literal: false,
      is_placeholder: true,
    });

    expect(
      buildSpecRulePreview({
        field_name: "EMAIL",
        question_code: "CAM",
        field_length: 50,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      })
    ).toEqual({
      source_expression: "RESP:CAM:EMAIL",
      transform_pipeline: "trim|lower",
      default_value: "unknown@example.mil",
      pad_rule: "pad:right:space",
      is_literal: false,
      is_placeholder: false,
    });

    expect(
      buildSpecRulePreview({
        field_name: "FORM_VERSION",
        question_code: null,
        field_length: 20,
        values_spec_raw: "XX1999_123456",
        domain_type: "SPEC_RAW",
      })
    ).toMatchObject({
      source_expression: "CONST",
      default_value: "XX1999_123456",
      is_literal: true,
      is_placeholder: false,
    });

    expect(
      buildSpecRulePreview({
        field_name: "RATING",
        question_code: "CAM",
        field_length: 1,
        values_spec_raw: "E=Excellent, V=Very Good, G=Good, F=Fair, P=Poor",
        domain_type: "ENUM",
      })
    ).toMatchObject({
      source_expression: "RESP:CAM:RATING",
      transform_pipeline: "trim",
      default_value: "E",
      is_literal: false,
      is_placeholder: false,
    });
  });

  test("maps question-backed fields to RESP:<Q>:<FIELD>", () => {
    const rule = buildSpecRulePreview({
      field_name: "LNAME",
      question_code: "CAM",
      field_length: 25,
      values_spec_raw: "Text Field",
      domain_type: "TEXT",
    });

    expect(rule.source_expression).toBe("RESP:CAM:LNAME");
    expect(rule.transform_pipeline).toBe("trim");
    expect(rule.is_literal).toBeFalsy();
  });

  test("maps FORM_TYPE literal to CONST", () => {
    const rule = buildSpecRulePreview({
      field_name: "FORM_TYPE",
      question_code: null,
      field_length: 5,
      values_spec_raw: "CAM",
      domain_type: "SPEC_RAW",
    });

    expect(rule.source_expression).toBe("CONST");
    expect(rule.default_value).toBe("CAM");
    expect(rule.is_literal).toBeTruthy();
  });

  test("uses placeholder CONST for non-question unknown field", () => {
    const rule = buildSpecRulePreview({
      field_name: "UNMAPPED_MISC",
      question_code: null,
      field_length: 8,
      values_spec_raw: "Text Field",
      domain_type: "TEXT",
    });

    expect(rule.source_expression).toBe("CONST");
    expect(rule.default_value.length).toBeGreaterThan(0);
    expect(rule.is_placeholder).toBeTruthy();
  });
});
