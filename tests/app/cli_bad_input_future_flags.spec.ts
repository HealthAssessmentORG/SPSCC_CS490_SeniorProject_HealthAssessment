import { test } from "@playwright/test";
import path from "node:path";
import { runCli } from "../_helpers/runCli";

test.describe("CLI bad-input future flags (Milestone 5 placeholders)", () => {
  const validFormPath = path.resolve(process.cwd(), "files", "ExportFixedWidthForDD2975.xlsx");

  test.fixme("--log-md invalid path handling", async () => {
    await runCli(["-form", validFormPath, "-gen", "1", "--log-md", "/definitely/not/writable/run.md"], {
      cwd: process.cwd(),
    });
  });

  test.fixme("--field-input-map missing file handling", async () => {
    await runCli(
      ["-form", validFormPath, "-gen", "1", "--field-input-map", "./files/does_not_exist_field_input_map.json"],
      { cwd: process.cwd() }
    );
  });

  test.fixme("--field-input-map malformed JSON handling", async () => {
    await runCli(
      ["-form", validFormPath, "-gen", "1", "--field-input-map", "./files/malformed_field_input_map.json"],
      { cwd: process.cwd() }
    );
  });

  test.fixme("--field-input-map wrong-shape JSON handling", async () => {
    await runCli(
      ["-form", validFormPath, "-gen", "1", "--field-input-map", "./files/wrong_shape_field_input_map.json"],
      { cwd: process.cwd() }
    );
  });
});
