import sql from "mssql";

export type DbPool = sql.ConnectionPool;
export type DbRequestContext = DbPool | sql.Transaction;

const poolCache = new Map<string, DbPool>();

function parseBooleanEnv(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") return fallback;

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;

  throw new TypeError(`Invalid boolean for ${name}: ${raw}`);
}

function parseNumberEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid number for ${name}: ${raw}`);
  }

  return parsed;
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (value != null && value.trim() !== "") return value;
  return undefined;
}

function requireEnvValue(name: string, label: string): string {
  const value = envValue(name);
  if (!value) {
    throw new Error(`${label} is required (${name})`);
  }
  return value;
}

export function getApplication2DbLogContext(cfg: sql.config) {
  const options = cfg.options ?? {};

  return {
    server: cfg.server,
    port: cfg.port ?? null,
    database: cfg.database,
    user: cfg.user,
    encrypt: options.encrypt ?? false,
    trustServerCertificate: options.trustServerCertificate ?? false,
    requestTimeout: cfg.requestTimeout ?? null,
    authMode: cfg.user ? "sql_login" : "unknown",
    hasPassword: Boolean(cfg.password),
    pwdLen: typeof cfg.password === "string" ? cfg.password.length : 0
  };
}

export function getApplication2DbConfigFromEnv(): sql.config {
  const server = requireEnvValue("APP2_DB_SERVER", "application2 DB server");
  const database = requireEnvValue("APP2_DB_DATABASE", "application2 DB database");
  const user = requireEnvValue("APP2_DB_USER", "application2 DB user");
  const password = requireEnvValue("APP2_DB_PASSWORD", "application2 DB password");
  const port = parseNumberEnv("APP2_DB_PORT", envValue("APP2_DB_PORT"), 1433);
  const encrypt = parseBooleanEnv("APP2_DB_ENCRYPT", envValue("APP2_DB_ENCRYPT"), false);
  const trustServerCertificate = parseBooleanEnv(
    "APP2_DB_TRUST_SERVER_CERTIFICATE",
    envValue("APP2_DB_TRUST_SERVER_CERTIFICATE"),
    true
  );
  const requestTimeout = parseNumberEnv(
    "APP2_DB_REQUEST_TIMEOUT_MS",
    envValue("APP2_DB_REQUEST_TIMEOUT_MS"),
    0
  );

  return {
    server,
    port,
    database,
    user,
    password,
    requestTimeout,
    options: {
      encrypt,
      trustServerCertificate
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000
    }
  };
}

export async function getApplication2Pool(): Promise<DbPool> {
  const cached = poolCache.get("application2");
  if (cached) return cached;

  const cfg = getApplication2DbConfigFromEnv();
  const pool = await new sql.ConnectionPool(cfg).connect();
  poolCache.set("application2", pool);
  return pool;
}

export async function closeApplication2Pool(): Promise<void> {
  const pool = poolCache.get("application2");
  if (!pool) return;

  await pool.close();
  poolCache.delete("application2");
}

export async function execSql(
  pool: DbRequestContext,
  text: string,
  params?: Record<string, { type: any; value: any }>
) {
  const req = pool.request();
  if (params) {
    for (const [key, param] of Object.entries(params)) {
      req.input(key, param.type, param.value);
    }
  }
  return req.query(text);
}

export { sql };
