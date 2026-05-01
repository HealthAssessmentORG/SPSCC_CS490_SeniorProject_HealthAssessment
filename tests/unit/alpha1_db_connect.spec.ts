import { test, expect } from "@playwright/test";

import { getDbConfigFromEnv, getDbLogContext } from "../../db/db_connect";

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
  "EXPORT_DB_REQUEST_TIMEOUT_MS"
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

test.describe("alpha1/export db config", () => {
  test.describe.configure({ mode: "serial" });

  test("alpha1 resolves only from DB_*", () => {
    withEnv(
      {
        DB_SERVER: "24.18.27.110",
        DB_PORT: "1433",
        DB_DATABASE: "DD2975_PreDHA",
        DB_USER: "sa",
        DB_PASSWORD: "3939",
        EXPORT_DB_SERVER: "export-host",
        EXPORT_DB_DATABASE: "ExportDb",
        EXPORT_DB_USER: "export_user",
        EXPORT_DB_PASSWORD: "export_pass"
      },
      () => {
        const cfg = getDbConfigFromEnv("alpha1");

        expect(cfg.server).toBe("24.18.27.110");
        expect(cfg.database).toBe("DD2975_PreDHA");
        expect(cfg.user).toBe("sa");
        expect(cfg.password).toBe("3939");
        expect(cfg.port).toBe(1433);
      }
    );
  });

  test("alpha1 fails when only export env is set", () => {
    withEnv(
      {
        EXPORT_DB_SERVER: "export-host",
        EXPORT_DB_DATABASE: "ExportDb",
        EXPORT_DB_USER: "export_user",
        EXPORT_DB_PASSWORD: "export_pass"
      },
      () => {
        expect(() => getDbConfigFromEnv("alpha1")).toThrow("DB_SERVER");
      }
    );
  });

  test("export resolves only from EXPORT_DB_*", () => {
    withEnv(
      {
        DB_SERVER: "24.18.27.110",
        DB_DATABASE: "DD2975_PreDHA",
        DB_USER: "sa",
        DB_PASSWORD: "3939",
        EXPORT_DB_SERVER: "localhost",
        EXPORT_DB_PORT: "1444",
        EXPORT_DB_DATABASE: "CS490_SeniorProject",
        EXPORT_DB_USER: "cs490_app",
        EXPORT_DB_PASSWORD: "password",
        EXPORT_DB_ENCRYPT: "true",
        EXPORT_DB_TRUST_SERVER_CERTIFICATE: "false",
        EXPORT_DB_REQUEST_TIMEOUT_MS: "5000"
      },
      () => {
        const cfg = getDbConfigFromEnv("export");

        expect(cfg.server).toBe("localhost");
        expect(cfg.database).toBe("CS490_SeniorProject");
        expect(cfg.user).toBe("cs490_app");
        expect(cfg.password).toBe("password");
        expect(cfg.port).toBe(1444);
        expect(cfg.requestTimeout).toBe(5000);
        expect(cfg.options?.encrypt).toBe(true);
        expect(cfg.options?.trustServerCertificate).toBe(false);
      }
    );
  });

  test("export rejects invalid numeric env values", () => {
    withEnv(
      {
        EXPORT_DB_SERVER: "localhost",
        EXPORT_DB_PORT: "not-a-number",
        EXPORT_DB_DATABASE: "CS490_SeniorProject",
        EXPORT_DB_USER: "cs490_app",
        EXPORT_DB_PASSWORD: "password"
      },
      () => {
        expect(() => getDbConfigFromEnv("export")).toThrow("Invalid number for EXPORT_DB_PORT: not-a-number");
      }
    );
  });

  test("export rejects invalid boolean env values", () => {
    withEnv(
      {
        EXPORT_DB_SERVER: "localhost",
        EXPORT_DB_DATABASE: "CS490_SeniorProject",
        EXPORT_DB_USER: "cs490_app",
        EXPORT_DB_PASSWORD: "password",
        EXPORT_DB_ENCRYPT: "sometimes"
      },
      () => {
        expect(() => getDbConfigFromEnv("export")).toThrow("Invalid boolean for EXPORT_DB_ENCRYPT: sometimes");
      }
    );
  });

  test("builds a redacted log context", () => {
    withEnv(
      {
        DB_SERVER: "24.18.27.110",
        DB_DATABASE: "DD2975_PreDHA",
        DB_USER: "sa",
        DB_PASSWORD: "3939"
      },
      () => {
        const logContext = getDbLogContext(getDbConfigFromEnv("alpha1"));

        expect(logContext).toMatchObject({
          server: "24.18.27.110",
          database: "DD2975_PreDHA",
          user: "sa",
          hasPassword: true,
          pwdLen: 4
        });
        expect(logContext).not.toHaveProperty("password");
      }
    );
  });
});
