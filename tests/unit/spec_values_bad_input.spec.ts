import { test, expect } from "@playwright/test";
import {
  classifyValuesSpec,
  inferNumericTemplateWidth,
  parseEnumPairs,
} from "../../features/spec_import/spec_values_part_01_utils";

test.describe("spec values bad-input handling", () => {
  test("malformed enum-like values do not crash parsing", () => {
    expect(() => parseEnumPairs("=NoCode, JustText")).not.toThrow();
    expect(parseEnumPairs("=NoCode, JustText")).toBeUndefined();
  });

  test("invalid numeric template inputs are not treated as numeric width", () => {
    expect(inferNumericTemplateWidth("99A9")).toBeUndefined();
    expect(inferNumericTemplateWidth("9 999")).toBeUndefined();
    expect(inferNumericTemplateWidth("XXXX")).toBeUndefined();
  });

  test("classification falls back to spec_raw for malformed equal-sign patterns", () => {
    const analysis = classifyValuesSpec("MISC", "=A, =B");
    expect(analysis.kind).toBe("spec_raw");
    expect(analysis.raw).toBe("=A, =B");
  });
});
