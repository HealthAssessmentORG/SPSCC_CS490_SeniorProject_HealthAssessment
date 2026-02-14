import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { writeLinesToFile } from "../../features/fixed_width/fixed_width_writer_part_02_stream_write";

test.describe("writeLinesToFile", () => {
  test("writes all lines with newlines", async ({}, testInfo) => {
    async function* gen() {
      yield "first";
      yield "second";
      yield "third";
    }

    const outPath = testInfo.outputPath("out.txt");
    await writeLinesToFile(outPath, gen());

    const s = await fs.promises.readFile(outPath, "utf8");
    expect(s).toBe("first\nsecond\nthird\n");
  });
});