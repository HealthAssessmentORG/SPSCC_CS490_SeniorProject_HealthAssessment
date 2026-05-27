import { test, expect } from "@playwright/test";

import type {
  Application2DatabaseFormSummary,
  Application2DatabaseSummary
} from "../../Application/02/src/types.js";
import type { Application2DashboardData } from "../../Application/02/src/ui_demo_data.js";
import {
  APP2_UI_EXPORT_FORM_METADATA_UNAVAILABLE,
  APP2_UI_EXPORT_RUNNING_NOTICE,
  buildApplication2UiExportCompleteView,
  buildApplication2UiExportReadiness,
  formatApplication2UiExportProgress,
  getApplication2UiExportBlockedNotice,
  sanitizeApplication2UiExportError
} from "../../Application/02/src/ui_export_state.js";

function summary(overrides: Partial<Application2DatabaseSummary> = {}): Application2DatabaseSummary {
  return {
    database: "app2",
    counts: {
      runs: 1,
      deployers: 1,
      assessments: 2,
      responses: 4,
      provider_reviews: 1,
      export_specs: 1,
      export_fields: 2,
      mapping_sets: 1,
      mapping_rules: 2,
      export_files: 0,
      validation_errors: 0
    },
    latest_run: {
      run_id: "11111111-1111-1111-1111-111111111111",
      run_name: "latest",
      seed: 0,
      target_record_count: 2,
      started_at: "2026-05-19T00:00:00.000Z",
      finished_at: null,
      status: "ready"
    },
    latest_export_file: null,
    ...overrides
  };
}

function dashboardData(
  dataSource: Application2DashboardData["dataSource"] = "live database",
  summaryOverrides: Partial<Application2DatabaseSummary> = {}
): Application2DashboardData {
  return {
    status: {
      database: "app2",
      tables: {
        RUN: true,
        EXPORT_SPEC: true
      }
    },
    summary: summary(summaryOverrides),
    loadedAt: "2026-05-19T00:00:00.000Z",
    dataSource
  };
}

function formSummary(overrides: Partial<Application2DatabaseFormSummary> = {}): Application2DatabaseFormSummary {
  return {
    database: "app2",
    forms: [
      {
        form_name: "DD2795 202006",
        spec_name: "DD2795",
        spec_version: "202006",
        uuids: {
          export_spec_id: "22222222-2222-2222-2222-222222222222",
          mapping_set_ids: ["33333333-3333-3333-3333-333333333333"]
        },
        fields: []
      }
    ],
    ...overrides
  };
}

test.describe("Application 2 UI export state", () => {
  test("builds deterministic live export defaults from dashboard and form summary data", () => {
    expect(buildApplication2UiExportReadiness(dashboardData(), formSummary(), true)).toEqual({
      ready: true,
      plan: {
        runId: "11111111-1111-1111-1111-111111111111",
        exportSpecId: "22222222-2222-2222-2222-222222222222",
        mappingSetId: "33333333-3333-3333-3333-333333333333",
        out: "out/application_02_ui_export_11111111-1111-1111-1111-111111111111.txt",
        formName: "DD2795 202006"
      }
    });
  });

  test("disables export for saved demo data even when IDs are present", () => {
    expect(buildApplication2UiExportReadiness(dashboardData("saved demo data"), formSummary(), true)).toEqual({
      ready: false,
      reason: "Export unavailable: saved demo data is not a live database."
    });
  });

  test("reports unavailable export metadata without exposing raw database errors", () => {
    expect(buildApplication2UiExportReadiness(dashboardData(), null, false)).toEqual({
      ready: false,
      reason: APP2_UI_EXPORT_FORM_METADATA_UNAVAILABLE
    });
  });

  test("reports missing latest run and missing mapping set distinctly", () => {
    expect(
      buildApplication2UiExportReadiness(dashboardData("live database", { latest_run: null }), formSummary(), true)
    ).toEqual({
      ready: false,
      reason: "Export unavailable: no latest run is available."
    });

    expect(
      buildApplication2UiExportReadiness(
        dashboardData(),
        formSummary({
          forms: [
            {
              ...formSummary().forms[0]!,
              uuids: {
                export_spec_id: "22222222-2222-2222-2222-222222222222",
                mapping_set_ids: []
              }
            }
          ]
        }),
        true
      )
    ).toEqual({
      ready: false,
      reason: "Export unavailable: no mapping set is available for the selected form."
    });
  });

  test("does not become ready with blank required export IDs", () => {
    expect(
      buildApplication2UiExportReadiness(
        dashboardData("live database", {
          latest_run: {
            ...summary().latest_run!,
            run_id: "  "
          }
        }),
        formSummary(),
        true
      )
    ).toEqual({
      ready: false,
      reason: "Export unavailable: no latest run is available."
    });

    expect(
      buildApplication2UiExportReadiness(
        dashboardData(),
        formSummary({
          forms: [
            {
              ...formSummary().forms[0]!,
              uuids: {
                export_spec_id: "  ",
                mapping_set_ids: ["33333333-3333-3333-3333-333333333333"]
              }
            }
          ]
        }),
        true
      )
    ).toEqual({
      ready: false,
      reason: "Export unavailable: no export form is available."
    });

    expect(
      buildApplication2UiExportReadiness(
        dashboardData(),
        formSummary({
          forms: [
            {
              ...formSummary().forms[0]!,
              uuids: {
                export_spec_id: "22222222-2222-2222-2222-222222222222",
                mapping_set_ids: ["  "]
              }
            }
          ]
        }),
        true
      )
    ).toEqual({
      ready: false,
      reason: "Export unavailable: no mapping set is available for the selected form."
    });
  });

  test("reports blocked UI actions only while export is running", () => {
    expect(getApplication2UiExportBlockedNotice("running")).toBe(APP2_UI_EXPORT_RUNNING_NOTICE);
    expect(getApplication2UiExportBlockedNotice("idle")).toBeNull();
    expect(getApplication2UiExportBlockedNotice("complete")).toBeNull();
    expect(getApplication2UiExportBlockedNotice("failed")).toBeNull();
  });

  test("formats export progress with bounded percentages", () => {
    expect(formatApplication2UiExportProgress(1, 4)).toEqual({
      recordText: "1/4",
      percentText: "25%"
    });
    expect(formatApplication2UiExportProgress(5, 4)).toEqual({
      recordText: "5/4",
      percentText: "100%"
    });
    expect(formatApplication2UiExportProgress(0, 0)).toEqual({
      recordText: "0/0",
      percentText: "n/a"
    });
  });

  test("builds the completion view from the export workflow result", () => {
    expect(
      buildApplication2UiExportCompleteView({
        ok: true,
        run_id: "run",
        export_file_id: "export-file",
        record_count: 10,
        out_path: "out/app2.txt",
        validation_error_count: 2
      })
    ).toEqual({
      outPath: "out/app2.txt",
      recordCount: 10,
      exportFileId: "export-file",
      validationErrorCount: 2
    });
  });

  test("sanitizes export errors for UI display", () => {
    expect(
      sanitizeApplication2UiExportError(new Error("application2 DB server is required (APP2_DB_SERVER)"))
    ).toBe("application2 DB server is required (APP2_DB_SERVER)");
    expect(
      sanitizeApplication2UiExportError(new Error("Application 2 database connection failed for APP2_DB_*."))
    ).toBe("Application 2 database connection failed for APP2_DB_*.");
    expect(sanitizeApplication2UiExportError(new Error("clear message\nat internal frame"))).toBe(
      "clear message"
    );
    expect(sanitizeApplication2UiExportError(new Error("password=secret"))).toBe(
      "Application 2 export failed."
    );
    expect(sanitizeApplication2UiExportError(new Error("Error\n    at hiddenFunction (/tmp/file.ts:1:1)"))).toBe(
      "Application 2 export failed."
    );
    expect(sanitizeApplication2UiExportError(new Error(`${"x".repeat(200)}`))).toHaveLength(180);
  });
});
