import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { readExportSpecXlsx } from "../../features/spec_import/spec_import_part_01_read_xlsx";
import {
  classifyValuesSpec,
  type ValuesSpecKind,
} from "../../features/spec_import/spec_values_part_01_utils";

test.describe("readExportSpecXlsx", () => {
  const REQUIRED_KINDS_BY_FORM_TYPE: Record<string, ValuesSpecKind[]> = {
    CAM: ["constant", "text", "date_yyyymmdd", "dodid10", "enum"],
    PRE: ["constant", "text", "date_yyyymmdd", "dodid10", "enum", "enum_yn"],
  };

  // Cases are based on XLSX files used
  const CASES = [
    { fileName: "ExportFixedWidthForSmoke.xlsx", specName: "smoke_like", expectedFormType: "CAM" },
    { fileName: "ExportFixedWidthForDD2975.xlsx", specName: "DD2975_like", expectedFormType: "PRE" },
  ] as const;

  for (const c of CASES) {
    test(`parses ${c.fileName} with expected FORM_TYPE-driven shape`, () => {
      const xlsxPath = path.resolve(process.cwd(), "files", c.fileName);
      expect(fs.existsSync(xlsxPath)).toBe(true);

      // Just test the happy (:3) path for now
      const spec = readExportSpecXlsx(xlsxPath, c.specName, "test");
      expect(spec.spec_name).toBe(c.specName);
      expect(spec.spec_version).toBe("test");
      expect(spec.fields.length).toBeGreaterThan(0);

      // Basic sanity checks on field positions and lengths
      const endPositions = spec.fields.map((f) => f.end_pos);
      expect(Math.max(...endPositions)).toBe(spec.row_length);

      // Check that field names are non-empty and positions/lengths are positive and consistent
      for (const f of spec.fields) {
        expect(f.field_name.trim().length).toBeGreaterThan(0);
        expect(f.length).toBeGreaterThan(0);
        expect(f.start_pos).toBeGreaterThan(0);
        expect(f.end_pos).toBeGreaterThanOrEqual(f.start_pos);
      }

      // Check that question_code is null for some fields and non-null for others (since both are expected)
      expect(spec.fields.some((f) => f.question_code === null)).toBe(true);
      expect(spec.fields.some((f) => f.question_code !== null)).toBe(true);

      // Check that FORM_TYPE and FORM_VERSION are present and have the expected constant values
      const formTypeField = spec.fields.find((f) => f.field_name === "FORM_TYPE");
      expect(formTypeField).toBeDefined();
      const formTypeAnalysis = classifyValuesSpec(
        formTypeField!.field_name,
        formTypeField!.values_spec_raw
      );
      expect(formTypeAnalysis.kind).toBe("constant");
      expect(formTypeAnalysis.literal_constant).toBe(c.expectedFormType);

      // Check that the required kinds of value specs are present based on the FORM_TYPE
      const formVersionField = spec.fields.find((f) => f.field_name === "FORM_VERSION");
      expect(formVersionField).toBeDefined();
      const formVersionAnalysis = classifyValuesSpec(
        formVersionField!.field_name,
        formVersionField!.values_spec_raw
      );
      expect(formVersionAnalysis.kind).toBe("constant");
      expect(formVersionAnalysis.literal_constant?.length).toBeGreaterThan(0);

      // Collect the kinds of value specs present in the spec 
      // and check that all required kinds for the form type are included
      const kindsInSpec = new Set(
        spec.fields.map((f) => classifyValuesSpec(f.field_name, f.values_spec_raw).kind)
      );
      const requiredKinds = REQUIRED_KINDS_BY_FORM_TYPE[c.expectedFormType];
      expect(requiredKinds).toBeDefined();

      // Check that all required kinds for the form type are present in the spec
      for (const k of requiredKinds) {
        expect(kindsInSpec.has(k)).toBe(true);
      }
    });
  }
});
