import { test, expect } from "@playwright/test";

import {
  getApplication2DbConfigFromEnv,
  getApplication2DbConfigResolutionFromEnv,
  getApplication2DbLogContext,
  getApplication2MssqlConnectionStringFromEnv
} from "../../Application/02/src/db/db_connect.js";

const DB_ENV_KEYS = [
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
];

function withEnv(temp: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();

  for (const key of DB_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(temp)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const key of DB_ENV_KEYS) {
      const oldValue = previous.get(key);
      if (oldValue == null) delete process.env[key];
      else process.env[key] = oldValue;
    }
  }
}

test.describe("Application 2 db config", () => {
  test.describe.configure({ mode: "serial" });

  test("prefers APP2_DB_* over fallback namespaces with defaults", () => {
    withEnv(
      {
        DB_SERVER: "alpha-host",
        DB_DATABASE: "AlphaDb",
        DB_USER: "alpha_user",
        DB_PASSWORD: "alpha_password",
        EXPORT_DB_SERVER: "export-host",
        EXPORT_DB_DATABASE: "ExportDb",
        EXPORT_DB_USER: "export_user",
        EXPORT_DB_PASSWORD: "export_password",
        APP2_DB_SERVER: "app2-host",
        APP2_DB_DATABASE: "App2Db",
        APP2_DB_USER: "app2_user",
        APP2_DB_PASSWORD: "app2_password"
      },
      () => {
        const cfg = getApplication2DbConfigFromEnv();

        expect(cfg.server).toBe("app2-host");
        expect(cfg.database).toBe("App2Db");
        expect(cfg.user).toBe("app2_user");
        expect(cfg.password).toBe("app2_password");
        expect(cfg.port).toBe(1433);
        expect(cfg.requestTimeout).toBe(0);
        expect(cfg.options?.encrypt).toBe(false);
        expect(cfg.options?.trustServerCertificate).toBe(true);
      }
    );
  });

  test("uses APP2_DB_* optional overrides", () => {
    withEnv(
      {
        APP2_DB_SERVER: "app2-host",
        APP2_DB_PORT: "1444",
        APP2_DB_DATABASE: "App2Db",
        APP2_DB_USER: "app2_user",
        APP2_DB_PASSWORD: "app2_password",
        APP2_DB_ENCRYPT: "true",
        APP2_DB_TRUST_SERVER_CERTIFICATE: "false",
        APP2_DB_REQUEST_TIMEOUT_MS: "5000"
      },
      () => {
        const cfg = getApplication2DbConfigFromEnv();

        expect(cfg.port).toBe(1444);
        expect(cfg.requestTimeout).toBe(5000);
        expect(cfg.options?.encrypt).toBe(true);
        expect(cfg.options?.trustServerCertificate).toBe(false);
      }
    );
  });

  test("falls back to EXPORT_DB_* when APP2_DB_* is not set", () => {
    withEnv(
      {
        DB_SERVER: "alpha-host",
        DB_DATABASE: "AlphaDb",
        DB_USER: "alpha_user",
        DB_PASSWORD: "alpha_password",
        EXPORT_DB_SERVER: "export-host",
        EXPORT_DB_DATABASE: "ExportDb",
        EXPORT_DB_USER: "export_user",
        EXPORT_DB_PASSWORD: "export_password"
      },
      () => {
        const resolution = getApplication2DbConfigResolutionFromEnv();
        const cfg = getApplication2DbConfigFromEnv();

        expect(resolution.candidates.map((candidate) => candidate.namespace)).toEqual([
          "EXPORT_DB_*",
          "DB_*"
        ]);
        expect(resolution.diagnostics).toContain(
          "Application 2 DB info: APP2_DB_* is not fully configured; using EXPORT_DB_* fallback."
        );
        expect(cfg.server).toBe("export-host");
        expect(cfg.database).toBe("ExportDb");
        expect(cfg.user).toBe("export_user");
        expect(cfg.password).toBe("export_password");
      }
    );
  });

  test("falls back to DB_* when APP2_DB_* and EXPORT_DB_* are not set", () => {
    withEnv(
      {
        DB_SERVER: "alpha-host",
        DB_DATABASE: "AlphaDb",
        DB_USER: "alpha_user",
        DB_PASSWORD: "alpha_password"
      },
      () => {
        const resolution = getApplication2DbConfigResolutionFromEnv();
        const cfg = getApplication2DbConfigFromEnv();

        expect(resolution.candidates.map((candidate) => candidate.namespace)).toEqual(["DB_*"]);
        expect(resolution.diagnostics).toContain(
          "Application 2 DB info: APP2_DB_* is not fully configured; using DB_* fallback."
        );
        expect(cfg.server).toBe("alpha-host");
        expect(cfg.database).toBe("AlphaDb");
        expect(cfg.user).toBe("alpha_user");
        expect(cfg.password).toBe("alpha_password");
      }
    );
  });

  test("warns and skips a partial APP2_DB_* config when fallback is complete", () => {
    withEnv(
      {
        APP2_DB_SERVER: "app2-host",
        EXPORT_DB_SERVER: "export-host",
        EXPORT_DB_DATABASE: "ExportDb",
        EXPORT_DB_USER: "export_user",
        EXPORT_DB_PASSWORD: "export_password"
      },
      () => {
        const resolution = getApplication2DbConfigResolutionFromEnv();
        const cfg = getApplication2DbConfigFromEnv();

        expect(resolution.candidates.map((candidate) => candidate.namespace)).toEqual(["EXPORT_DB_*"]);
        expect(resolution.diagnostics).toEqual([
          "Application 2 DB warning: APP2_DB_* is partially or invalidly configured and will be skipped. application2 DB database is required (APP2_DB_DATABASE)",
          "Application 2 DB info: APP2_DB_* is not fully configured; using EXPORT_DB_* fallback."
        ]);
        expect(cfg.server).toBe("export-host");
      }
    );
  });

  test("rejects invalid numeric env values", () => {
    withEnv(
      {
        APP2_DB_SERVER: "app2-host",
        APP2_DB_PORT: "not-a-number",
        APP2_DB_DATABASE: "App2Db",
        APP2_DB_USER: "app2_user",
        APP2_DB_PASSWORD: "app2_password"
      },
      () => {
        expect(() => getApplication2DbConfigFromEnv()).toThrow("Invalid number for APP2_DB_PORT: not-a-number");
      }
    );
  });

  test("rejects invalid boolean env values", () => {
    withEnv(
      {
        APP2_DB_SERVER: "app2-host",
        APP2_DB_DATABASE: "App2Db",
        APP2_DB_USER: "app2_user",
        APP2_DB_PASSWORD: "app2_password",
        APP2_DB_ENCRYPT: "sometimes"
      },
      () => {
        expect(() => getApplication2DbConfigFromEnv()).toThrow("Invalid boolean for APP2_DB_ENCRYPT: sometimes");
      }
    );
  });

  test("builds a redacted log context", () => {
    withEnv(
      {
        APP2_DB_SERVER: "app2-host",
        APP2_DB_DATABASE: "App2Db",
        APP2_DB_USER: "app2_user",
        APP2_DB_PASSWORD: "secret"
      },
      () => {
        const logContext = getApplication2DbLogContext(getApplication2DbConfigFromEnv());

        expect(logContext).toMatchObject({
          server: "app2-host",
          database: "App2Db",
          user: "app2_user",
          hasPassword: true,
          pwdLen: 6
        });
        expect(logContext).not.toHaveProperty("password");
      }
    );
  });

  test("builds the shared MSSQL connection string from the selected namespace", () => {
    withEnv(
      {
        DB_SERVER: "alpha-host",
        DB_PORT: "1500",
        DB_DATABASE: "AlphaDb",
        DB_USER: "alpha_user",
        DB_PASSWORD: "alpha_password",
        DB_ENCRYPT: "false",
        DB_TRUST_SERVER_CERTIFICATE: "true",
        APP2_DB_SERVER: "app2-host",
        APP2_DB_PORT: "1444",
        APP2_DB_DATABASE: "App2Db",
        APP2_DB_USER: "app2_user",
        APP2_DB_PASSWORD: "app2_password",
        APP2_DB_ENCRYPT: "true",
        APP2_DB_TRUST_SERVER_CERTIFICATE: "false"
      },
      () => {
        expect(getApplication2MssqlConnectionStringFromEnv()).toBe(
          "SERVER=app2-host,1444;DATABASE=App2Db;UID=app2_user;PWD=app2_password;Encrypt=yes;TrustServerCertificate=no"
        );
      }
    );
  });
});
