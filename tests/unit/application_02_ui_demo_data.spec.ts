import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";

import {
  loadApplication2UiDemoData,
  parseApplication2UiDemoData,
  readApplication2UiDemoDataPath
} from "../../Application/02/src/ui_demo_data.js";

const validDemoData = {
  status: {
    ok: true,
    database: "demo_database",
    tables: {
      RUN: true,
      ASSESSMENT: true
    }
  },
  summary: {
    ok: true,
    database: "demo_database",
    counts: {
      runs: 1,
      deployers: 1,
      assessments: 1,
      responses: 2,
      provider_reviews: 1,
      export_specs: 1,
      export_fields: 2,
      mapping_sets: 1,
      mapping_rules: 2,
      export_files: 1,
      validation_errors: 0
    },
    latest_run: null,
    latest_export_file: null
  }
};

test.describe("Application 2 UI demo data", () => {
  test("reads a trimmed demo data path from env", () => {
    expect(readApplication2UiDemoDataPath({ APP2_UI_DEMO_DATA_PATH: "  demo.json  " })).toBe("demo.json");
    expect(readApplication2UiDemoDataPath({ APP2_UI_DEMO_DATA_PATH: "   " })).toBeNull();
    expect(readApplication2UiDemoDataPath({})).toBeNull();
  });

  test("parses the minimum saved demo data shape", () => {
    expect(parseApplication2UiDemoData(validDemoData)).toEqual({
      status: {
        database: "demo_database",
        tables: {
          RUN: true,
          ASSESSMENT: true
        }
      },
      summary: {
        database: "demo_database",
        counts: validDemoData.summary.counts,
        latest_run: null,
        latest_export_file: null
      }
    });
  });

  test("rejects missing ok flags with concise errors", () => {
    expect(() =>
      parseApplication2UiDemoData({
        ...validDemoData,
        status: { ...validDemoData.status, ok: false }
      })
    ).toThrow("Application 2 UI demo data status.ok must be true");
  });

  test("rejects invalid table and count shapes", () => {
    expect(() =>
      parseApplication2UiDemoData({
        ...validDemoData,
        status: { ...validDemoData.status, tables: [] }
      })
    ).toThrow("Application 2 UI demo data status.tables must be an object");

    expect(() =>
      parseApplication2UiDemoData({
        ...validDemoData,
        summary: { ...validDemoData.summary, counts: null }
      })
    ).toThrow("Application 2 UI demo data summary.counts must be an object");
  });

  test("loads saved demo data from a JSON file", async ({}, testInfo) => {
    const path = testInfo.outputPath("app2_ui_demo_data.json");
    await fs.writeFile(path, JSON.stringify(validDemoData), "utf8");

    await expect(loadApplication2UiDemoData(path, () => new Date("2026-05-15T16:00:00.000Z"))).resolves.toEqual({
      status: {
        database: "demo_database",
        tables: {
          RUN: true,
          ASSESSMENT: true
        }
      },
      summary: {
        database: "demo_database",
        counts: validDemoData.summary.counts,
        latest_run: null,
        latest_export_file: null
      },
      loadedAt: "2026-05-15T16:00:00.000Z",
      dataSource: "saved demo data"
    });
  });

  test("rejects malformed JSON with a concise error", async ({}, testInfo) => {
    const path = testInfo.outputPath("bad_demo_data.json");
    await fs.writeFile(path, "{bad json", "utf8");

    await expect(loadApplication2UiDemoData(path)).rejects.toThrow("Application 2 UI demo data is not valid JSON");
  });

  test("rejects unreadable files with a concise error", async ({}, testInfo) => {
    await expect(loadApplication2UiDemoData(testInfo.outputPath("missing.json"))).rejects.toThrow(
      "Application 2 UI demo data could not be read"
    );
  });
});
