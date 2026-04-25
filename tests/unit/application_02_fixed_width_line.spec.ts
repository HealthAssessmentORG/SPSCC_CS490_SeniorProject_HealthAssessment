import { test, expect } from "@playwright/test";
import fs from "node:fs";

import { buildFixedWidthLine } from "../../Application/02/src/fixed_width/place_fields";
import { writeLinesToFile } from "../../Application/02/src/fixed_width/stream_write";
import type { Application2WriterFieldPlan } from "../../Application/02/src/mapping/build_writer_plan";
import type { Application2RecordContext } from "../../Application/02/src/types";

const ctx: Application2RecordContext = {
  assessment: {},
  deployer: {},
  provider_review: {},
  responses: new Map()
};

test.describe("Application 2 buildFixedWidthLine", () => {
  test("places multiple non-overlapping fields into an exact row", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "FORM_TYPE",
        start_pos: 1,
        length: 3,
        domain_type: null,
        getValue: () => "CAM"
      },
      {
        field_name: "ID",
        start_pos: 5,
        length: 4,
        domain_type: null,
        getValue: () => "1234"
      },
      {
        field_name: "OK",
        start_pos: 10,
        length: 1,
        domain_type: null,
        getValue: () => "Y"
      }
    ];

    const { line, fieldValues } = buildFixedWidthLine(12, plan, ctx);

    expect(line).toBe("CAM 1234 Y  ");
    expect([...fieldValues.entries()]).toEqual([
      ["FORM_TYPE", "CAM"],
      ["ID", "1234"],
      ["OK", "Y"]
    ]);
  });

  test("uses one-based positions and lets later fields overwrite earlier fields", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "F1",
        start_pos: 2,
        length: 5,
        domain_type: null,
        getValue: () => "HELLO"
      },
      {
        field_name: "F2",
        start_pos: 5,
        length: 2,
        domain_type: null,
        getValue: () => "ZZ"
      }
    ];

    const { line } = buildFixedWidthLine(7, plan, ctx);

    expect(line).toBe(" HELZZ ");
  });

  test("ignores characters beyond row length but preserves full field value", () => {
    const plan: Application2WriterFieldPlan[] = [
      {
        field_name: "TAIL",
        start_pos: 4,
        length: 5,
        domain_type: null,
        getValue: () => "ABCDE"
      }
    ];

    const { line, fieldValues } = buildFixedWidthLine(6, plan, ctx);

    expect(line).toBe("   ABC");
    expect(fieldValues.get("TAIL")).toBe("ABCDE");
  });
});

test.describe("Application 2 writeLinesToFile", () => {
  test("writes all lines with trailing newlines", async ({}, testInfo) => {
    async function* gen() {
      yield "first";
      yield "second";
      yield "third";
    }

    const outPath = testInfo.outputPath("out.txt");
    await writeLinesToFile(outPath, gen());

    await expect(fs.promises.readFile(outPath, "utf8")).resolves.toBe("first\nsecond\nthird\n");
  });
});
