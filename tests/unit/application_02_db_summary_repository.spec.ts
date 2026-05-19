import { test, expect } from "@playwright/test";

import type { DbPool } from "../../Application/02/src/db/db_connect.js";
import { loadDatabaseFormSummary } from "../../Application/02/src/repositories/database_form_summary_repository.js";

type QueryCall = {
  text: string;
  inputs: Array<{ name: string; value: unknown }>;
};

function fakePool(recordsets: Array<Array<Record<string, unknown>> | Error>) {
  const calls: QueryCall[] = [];

  const pool = {
    request() {
      const inputs: Array<{ name: string; value: unknown }> = [];
      return {
        input(name: string, _type: unknown, value: unknown) {
          inputs.push({ name, value });
          return this;
        },
        async query(text: string) {
          calls.push({ text, inputs: [...inputs] });
          const next = recordsets.shift();
          if (next instanceof Error) throw next;
          return { recordset: next ?? [] };
        }
      };
    }
  } as unknown as DbPool;

  return { pool, calls };
}

test.describe("Application 2 database form summary repository", () => {
  test("groups form definitions with fields and mapping set UUIDs", async () => {
    const { pool, calls } = fakePool([
      [{ database_name: "app2_test" }],
      [
        {
          export_spec_id: "spec-1",
          spec_name: "DD2795",
          spec_version: "202006"
        },
        {
          export_spec_id: "spec-2",
          spec_name: "DD2975",
          spec_version: "202405"
        }
      ],
      [
        {
          export_spec_id: "spec-1",
          export_field_id: "field-1",
          field_order: "1",
          question_code: "DEM",
          field_name: "DODID",
          start_pos: "1",
          end_pos: "10",
          field_length: "10",
          value_raw: "must-not-leak"
        },
        {
          export_spec_id: "spec-1",
          export_field_id: "field-2",
          field_order: 2,
          question_code: null,
          field_name: "FORM_VERSION",
          start_pos: 11,
          end_pos: 20,
          field_length: 10
        }
      ],
      [
        { export_spec_id: "spec-1", mapping_set_id: "mapping-1a" },
        { export_spec_id: "spec-1", mapping_set_id: "mapping-1b" },
        { export_spec_id: "spec-2", mapping_set_id: "mapping-2a" }
      ]
    ]);

    const summary = await loadDatabaseFormSummary(pool);

    expect(summary).toEqual({
      database: "app2_test",
      forms: [
        {
          form_name: "DD2795 202006",
          spec_name: "DD2795",
          spec_version: "202006",
          uuids: {
            export_spec_id: "spec-1",
            mapping_set_ids: ["mapping-1a", "mapping-1b"]
          },
          fields: [
            {
              field_name: "DODID",
              field_uuid: "field-1",
              field_order: 1,
              question_code: "DEM",
              start_pos: 1,
              end_pos: 10,
              field_length: 10
            },
            {
              field_name: "FORM_VERSION",
              field_uuid: "field-2",
              field_order: 2,
              question_code: null,
              start_pos: 11,
              end_pos: 20,
              field_length: 10
            }
          ]
        },
        {
          form_name: "DD2975 202405",
          spec_name: "DD2975",
          spec_version: "202405",
          uuids: {
            export_spec_id: "spec-2",
            mapping_set_ids: ["mapping-2a"]
          },
          fields: []
        }
      ]
    });

    const allSql = calls.map((call) => call.text).join("\n");
    expect(allSql).not.toContain("RESPONSE");
    expect(JSON.stringify(summary)).not.toContain("must-not-leak");
  });

  test("returns an empty forms array when no export specs exist", async () => {
    const { pool } = fakePool([[{ database_name: "app2_empty" }], [], [], []]);

    await expect(loadDatabaseFormSummary(pool)).resolves.toEqual({
      database: "app2_empty",
      forms: []
    });
  });

  test("preserves forms with no fields or mapping sets", async () => {
    const { pool } = fakePool([
      [{ database_name: "app2_sparse" }],
      [{ export_spec_id: "spec-without-children", spec_name: "Sparse", spec_version: "v1" }],
      [],
      []
    ]);

    await expect(loadDatabaseFormSummary(pool)).resolves.toEqual({
      database: "app2_sparse",
      forms: [
        {
          form_name: "Sparse v1",
          spec_name: "Sparse",
          spec_version: "v1",
          uuids: {
            export_spec_id: "spec-without-children",
            mapping_set_ids: []
          },
          fields: []
        }
      ]
    });
  });

  test("uses deterministic metadata query ordering", async () => {
    const { pool, calls } = fakePool([[{ database_name: "app2_order" }], [], [], []]);

    await loadDatabaseFormSummary(pool);

    expect(calls).toHaveLength(4);
    expect(calls[0]!.text).toContain("DB_NAME()");
    expect(calls[1]!.text).toContain("FROM dbo.EXPORT_SPEC");
    expect(calls[1]!.text).toContain("ORDER BY spec_name, spec_version, export_spec_id");
    expect(calls[2]!.text).toContain("FROM dbo.EXPORT_FIELD");
    expect(calls[2]!.text).toContain("ORDER BY export_spec_id, field_order, field_name, export_field_id");
    expect(calls[3]!.text).toContain("FROM dbo.MAPPING_SET");
    expect(calls[3]!.text).toContain("ORDER BY export_spec_id, mapping_set_id");
    for (const call of calls) {
      expect(call.inputs).toEqual([]);
    }
  });

  test("reports a safe export-schema error when form metadata tables are missing", async () => {
    const { pool } = fakePool([
      [{ database_name: "DD2975_PreDHA" }],
      new Error("Invalid object name 'dbo.EXPORT_SPEC'. Server=tcp:private-db password=secret")
    ]);

    await expect(loadDatabaseFormSummary(pool)).rejects.toThrow(
      "Database form summary requires Application 2 export schema. Selected database DD2975_PreDHA is missing EXPORT_SPEC, EXPORT_FIELD, or MAPPING_SET."
    );
  });
});
