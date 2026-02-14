import { test, expect } from "@playwright/test";
import {
  parseSourceExpression,
  parseTransformPipeline,
  parsePadRule,
} from "../../features/mapping/mapping_compile_part_01_parse_rules";

test.describe("mapping rule parsing", () => {
  test("parses COL sources", () => {
    expect(parseSourceExpression("COL:ASSESSMENT.event_date")).toEqual({
      kind: "col",
      table: "ASSESSMENT",
      column: "event_date",
    });
  });

  test("parses RESP sources", () => {
    expect(parseSourceExpression("RESP:DEM:LNAME")).toEqual({
      kind: "resp",
      question_code: "DEM",
      field_name: "LNAME",
    });
  });

  test("parses transform pipelines", () => {
    const ops = parseTransformPipeline("trim|lower|date:yyyymmdd");
    expect(ops.map((o) => o.kind)).toEqual(["trim", "lower", "date_yyyymmdd"]);
  });

  test("parses pad rules", () => {
    expect(parsePadRule(null)).toEqual({ kind: "none" });
    expect(parsePadRule("pad:right:space")).toEqual({ kind: "right_space" });
    expect(parsePadRule("pad:left:0")).toEqual({ kind: "left_zero" });
  });

  test("throws on unknown inputs", () => {
    expect(() => parseSourceExpression("WAT:???")).toThrow();
    expect(() => parseTransformPipeline("trim|wut")).toThrow();
  });
});
