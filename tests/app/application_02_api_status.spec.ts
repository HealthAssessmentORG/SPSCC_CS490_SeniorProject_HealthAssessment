import http from "node:http";
import type { AddressInfo } from "node:net";

import { test, expect } from "@playwright/test";

import { createApplication2Server } from "../../Application/02/src/api/server.js";
import { closeApplication2Pool, type DbPool } from "../../Application/02/src/db_connect.js";
import { APPLICATION2_REQUIRED_DATABASE_TABLES } from "../../Application/02/src/repositories/database_status_repository.js";

type QueryCall = {
  text: string;
  inputs: Array<{ name: string; value: unknown }>;
};

const app2DbEnvKeys = [
  "DB_SERVER",
  "DB_PORT",
  "DB_DATABASE",
  "DB_USER",
  "DB_PASSWORD",
  "DB_ENCRYPT",
  "DB_TRUST_SERVER_CERTIFICATE",
  "DB_REQUEST_TIMEOUT_MS",
  "EXPORT_DB_SERVER",
  "EXPORT_DB_PORT",
  "EXPORT_DB_DATABASE",
  "EXPORT_DB_USER",
  "EXPORT_DB_PASSWORD",
  "EXPORT_DB_ENCRYPT",
  "EXPORT_DB_TRUST_SERVER_CERTIFICATE",
  "EXPORT_DB_REQUEST_TIMEOUT_MS",
  "APP2_DB_SERVER",
  "APP2_DB_PORT",
  "APP2_DB_DATABASE",
  "APP2_DB_USER",
  "APP2_DB_PASSWORD",
  "APP2_DB_ENCRYPT",
  "APP2_DB_TRUST_SERVER_CERTIFICATE",
  "APP2_DB_REQUEST_TIMEOUT_MS"
] as const;

function allTablesPresent() {
  return Object.fromEntries(APPLICATION2_REQUIRED_DATABASE_TABLES.map((table) => [table, true]));
}

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

test.describe("Application 2 database status API", () => {
  test("GET /database/status returns database name and required table map", async () => {
    const { pool, calls } = fakePool([
      [{ database_name: "app2_test" }],
      APPLICATION2_REQUIRED_DATABASE_TABLES.map((table) => ({ TABLE_NAME: table }))
    ]);

    await withServer(createApplication2Server({ getPool: async () => pool }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/database/status?ignored=1`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
      expect(body).toEqual({
        ok: true,
        database: "app2_test",
        tables: allTablesPresent()
      });
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.text).toContain("DB_NAME()");
    expect(calls[1]!.text).toContain("INFORMATION_SCHEMA.TABLES");
    expect(calls[1]!.text).not.toContain("COUNT(");
  });

  test("GET /database/status accepts the legacy alpha1 schema", async () => {
    const { pool } = fakePool([
      [{ database_name: "DD2975_PreDHA" }],
      [{ TABLE_NAME: "ASSESSMENT" }, { TABLE_NAME: "FIELD" }, { TABLE_NAME: "RESPONSE" }]
    ]);

    await withServer(createApplication2Server({ getPool: async () => pool }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/database/status`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        database: "DD2975_PreDHA",
        tables: {
          ASSESSMENT: true,
          FIELD: true,
          RESPONSE: true
        }
      });
    });
  });

  test("GET /database/status returns safe missing-env failure from default DB config", async () => {
    await withClearedApp2DbEnv(async () => {
      await withServer(createApplication2Server(), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/status`);
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

  test("GET /database/status sanitizes connection and repository errors", async () => {
    async function expectSanitized(server: http.Server) {
      await withServer(server, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/status`);
        const text = await response.text();

        expect(response.status).toBe(503);
        expect(JSON.parse(text)).toEqual({
          ok: false,
          error: "Database status check failed"
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
        loadDatabaseStatus: async () => {
          throw new Error("SQL failed near password=super-secret on private-db");
        }
      })
    );
  });

  test("GET /database/status reports missing required tables without summary fields", async () => {
    const { pool } = fakePool([
      [{ database_name: "app2_test" }],
      APPLICATION2_REQUIRED_DATABASE_TABLES.filter((table) => table !== "RESPONSE").map((table) => ({
        TABLE_NAME: table
      }))
    ]);

    await withServer(createApplication2Server({ getPool: async () => pool }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/database/status`);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({
        ok: false,
        error: "Missing required database tables: RESPONSE"
      });
      expect(JSON.stringify(body)).not.toContain("summary");
      expect(JSON.stringify(body)).not.toContain("count");
    });
  });

  test("unknown routes return 404 without touching DB", async () => {
    let called = false;

    await withServer(
      createApplication2Server({
        getPool: async () => {
          called = true;
          throw new Error("should not be called");
        }
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/not-found`);
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
        expect(body).toEqual({ ok: false, error: "Not found" });
      }
    );

    expect(called).toBe(false);
  });

  test("unsupported methods on /database/status return 405 without touching DB", async () => {
    let called = false;

    await withServer(
      createApplication2Server({
        getPool: async () => {
          called = true;
          throw new Error("should not be called");
        }
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/database/status`, { method: "POST" });
        const body = await response.json();

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET");
        expect(response.headers.get("content-type")).toContain("application/json; charset=utf-8");
        expect(body).toEqual({ ok: false, error: "Method not allowed" });
      }
    );

    expect(called).toBe(false);
  });
});
