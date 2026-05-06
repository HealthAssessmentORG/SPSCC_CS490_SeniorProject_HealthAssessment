import { test, expect } from "@playwright/test";

import {
  getApplication2DbConfigFromEnv,
  getApplication2DbLogContext
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

  test("resolves only from APP2_DB_* with defaults", () => {
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

  test("fails when only root DB env namespaces are set", () => {
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
        expect(() => getApplication2DbConfigFromEnv()).toThrow("APP2_DB_SERVER");
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
});
