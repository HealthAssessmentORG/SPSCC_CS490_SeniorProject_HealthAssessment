import http from "node:http";
import type { AddressInfo } from "node:net";

import { test, expect } from "@playwright/test";

import { createApplication2Server } from "../../Application/02/src/api/server";
import { closeApplication2Pool, type DbPool } from "../../Application/02/src/db_connect";

type QueryCall = {
  text: string;
  inputs: Array<{ name: string; value: unknown }>;
};

const app2DbEnvKeys = [
  "APP2_DB_SERVER",
  "APP2_DB_PORT",
  "APP2_DB_DATABASE",
  "APP2_DB_USER",
  "APP2_DB_PASSWORD",
  "APP2_DB_ENCRYPT",
  "APP2_DB_TRUST_SERVER_CERTIFICATE",
  "APP2_DB_REQUEST_TIMEOUT_MS"
] as const;

const zeroCounts = {
  runs: 0,
  deployers: 0,
  assessments: 0,
  responses: 0,
  provider_reviews: 0,
  export_specs: 0,
  export_fields: 0,
  mapping_sets: 0,
  mapping_rules: 0,
  export_files: 0,
  validation_errors: 0
};

function fakePool(recordsets: Array<Array<Record<string, unknown>>>) {
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
          return { recordset: recordsets.shift() ?? [] };
        }
      };
    }
  } as unknown as DbPool;

  return { pool, calls };
}

async function listen(server: http.Server): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function withServer(server: http.Server, fn: (baseUrl: string) => Promise<void>) {
  const baseUrl = await listen(server);
  try {
    await fn(baseUrl);
  } finally {
    await closeServer(server);
  }
}

async function withClearedApp2DbEnv(fn: () => Promise<void>) {
  const original = new Map(app2DbEnvKeys.map((key) => [key, process.env[key]]));
  await closeApplication2Pool();

  for (const key of app2DbEnvKeys) {
    process.env[key] = "";
  }

  try {
    await fn();
  } finally {
    for (const key of app2DbEnvKeys) {
      const value = original.get(key);
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    await closeApplication2Pool();
  }
}

test.describe("Application 2 database summary API", () => {
  test("GET /database/summary returns aggregate counts and latest-row metadata", async () => {
    const startedAt = new Date("2026-02-14T00:00:00.000Z");
    const finishedAt = new Date("2026-02-14T00:02:00.000Z");
    const createdAt = new Date("2026-02-14T00:05:00.000Z");
    const { pool, calls } = fakePool([
      [{ database_name: "app2_test" }],
      [
        {
          runs: "2",
          deployers: "3",
          assessments: "5",
          responses: "55",
          provider_reviews: "5",
          export_specs: "1",
          export_fields: "20",
          mapping_sets: "1",
          mapping_rules: "20",
          export_files: "1",
          validation_errors: "4"
        }
      ],
      [
        {
          run_id: "11111111-1111-1111-1111-111111111111",
          run_name: "latest",
          seed: "123",
          target_record_count: "5",
          started_at: startedAt,
          finished_at: finishedAt,
          status: "finished"
        }
      ],
      [
        {
          export_file_id: "22222222-2222-2222-2222-222222222222",
          run_id: "11111111-1111-1111-1111-111111111111",
          file_path: "./out/app2.txt",
          record_count: "5",
          created_at: createdAt,
          secret_column: "must-not-leak"
        }
      ]
    ]);

    await withServer(createApplication2Server({ getPool: async () => pool }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/database/summary?ignored=1`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
      expect(body).toEqual({
        ok: true,
        database: "app2_test",
        counts: {
          runs: 2,
          deployers: 3,
          assessments: 5,
          responses: 55,
          provider_reviews: 5,
          export_specs: 1,
          export_fields: 20,
          mapping_sets: 1,
          mapping_rules: 20,
          export_files: 1,
          validation_errors: 4
        },
        latest_run: {
          run_id: "11111111-1111-1111-1111-111111111111",
          run_name: "latest",
          seed: 123,
          target_record_count: 5,
          started_at: "2026-02-14T00:00:00.000Z",
          finished_at: "2026-02-14T00:02:00.000Z",
          status: "finished"
        },
        latest_export_file: {
          export_file_id: "22222222-2222-2222-2222-222222222222",
          run_id: "11111111-1111-1111-1111-111111111111",
          file_path: "./out/app2.txt",
          record_count: 5,
          created_at: "2026-02-14T00:05:00.000Z"
        }
      });
      expect(JSON.stringify(body)).not.toContain("must-not-leak");
    });

    expect(calls).toHaveLength(4);
    expect(calls[0]!.text).toContain("DB_NAME()");
    expect(calls[1]!.text).toContain("COUNT(*)");
    expect(calls[1]!.text).toContain("FROM dbo.VALIDATION_ERROR");
    expect(calls[2]!.text).toContain("FROM dbo.[RUN]");
    expect(calls[2]!.text).toContain("ORDER BY started_at DESC, run_id DESC");
    expect(calls[3]!.text).toContain("FROM dbo.EXPORT_FILE");
    expect(calls[3]!.text).toContain("ORDER BY created_at DESC, export_file_id DESC");
  });

  test("GET /database/summary returns null latest rows when no rows exist", async () => {
    const { pool } = fakePool([[{ database_name: "app2_empty" }], [zeroCounts], [], []]);

    await withServer(createApplication2Server({ getPool: async () => pool }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/database/summary`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        database: "app2_empty",
        counts: zeroCounts,
        latest_run: null,
        latest_export_file: null
      });
    });
  });

  test("GET /database/summary returns safe missing-env failure from default DB config", async () => {
    await withClearedApp2DbEnv(async () => {
      await withServer(createApplication2Server(), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/summary`);
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
        expect(body).toEqual({
          ok: false,
          error: "application2 DB server is required (APP2_DB_SERVER)"
        });
      });
    });
  });

  test("GET /database/summary sanitizes connection and repository errors", async () => {
    async function expectSanitized(server: http.Server) {
      await withServer(server, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/summary`);
        const text = await response.text();

        expect(response.status).toBe(503);
        expect(JSON.parse(text)).toEqual({
          ok: false,
          error: "Database summary check failed"
        });
        expect(text).not.toContain("super-secret");
        expect(text).not.toContain("private-db");
        expect(text).not.toContain("password=");
      });
    }

    const { pool } = fakePool([]);

    await expectSanitized(
      createApplication2Server({
        getPool: async () => {
          throw new Error("Login failed for password=super-secret; Server=tcp:private-db");
        }
      })
    );
    await expectSanitized(
      createApplication2Server({
        getPool: async () => pool,
        loadDatabaseSummary: async () => {
          throw new Error("SQL failed near password=super-secret on private-db");
        }
      })
    );
  });

  test("unsupported methods on /database/summary return 405 without touching DB", async () => {
    let called = false;

    await withServer(
      createApplication2Server({
        getPool: async () => {
          called = true;
          throw new Error("should not be called");
        }
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/summary`, { method: "POST" });
        const body = await response.json();

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET");
        expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
        expect(body).toEqual({ ok: false, error: "Method not allowed" });
      }
    );

    expect(called).toBe(false);
  });

  test("unknown routes still return 404 without touching DB", async () => {
    let called = false;

    await withServer(
      createApplication2Server({
        getPool: async () => {
          called = true;
          throw new Error("should not be called");
        }
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/unknown`);
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
        expect(body).toEqual({ ok: false, error: "Not found" });
      }
    );

    expect(called).toBe(false);
  });

  test("GET /database/status shape remains unchanged after summary route registration", async () => {
    const { pool } = fakePool([]);

    await withServer(
      createApplication2Server({
        getPool: async () => pool,
        loadDatabaseStatus: async () => ({
          database: "app2_status",
          tables: { RUN: true }
        }),
        loadDatabaseSummary: async () => {
          throw new Error("summary should not be called");
        }
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/status`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
          ok: true,
          database: "app2_status",
          tables: { RUN: true }
        });
        expect(JSON.stringify(body)).not.toContain("counts");
        expect(JSON.stringify(body)).not.toContain("latest_run");
      }
    );
  });
});
