import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { readExportSpecXlsx } from "../../features/spec_import/spec_import_part_01_read_xlsx";

test.describe("readExportSpecXlsx", () => {
  test("reads the provided DD2975 spec and derives row_length", () => {
    const xlsxPath = path.resolve(process.cwd(), "files", "ExportFixedWidthForDD2975.xlsx");
    expect(fs.existsSync(xlsxPath)).toBeTruthy();

    const spec = readExportSpecXlsx(xlsxPath, "DD2975_like", "test");
    expect(spec.fields.length).toBeGreaterThan(10);
    expect(spec.row_length).toBeGreaterThan(100);

    // A few known fields from your pre-alpha mapping.
    const names = new Set(spec.fields.map((f) => f.field_name));
    expect(names.has("FORM_TYPE")).toBeTruthy();
    expect(names.has("FORM_VERSION")).toBeTruthy();
    expect(names.has("DODID")).toBeTruthy();
  });
});
