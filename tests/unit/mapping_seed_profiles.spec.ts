import { expect, test } from "@playwright/test";
import { buildSpecRulePreview } from "../../features/mapping/mapping_seed_part_03_profiles";

test.describe("spec mapping profile rule builder", () => {
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
