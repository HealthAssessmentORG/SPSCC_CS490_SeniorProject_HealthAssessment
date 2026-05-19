import sql from "mssql";

export type DbPool = sql.ConnectionPool;
export type DbRequestContext = DbPool | sql.Transaction;

const poolCache = new Map<string, DbPool>();

type DbEnvSource = {
  namespace: "APP2_DB_*" | "EXPORT_DB_*" | "DB_*";
  prefix: "APP2_DB" | "EXPORT_DB" | "DB";
  label: string;
};

export type Application2DbConfigCandidate = {
  config: sql.config;
  namespace: DbEnvSource["namespace"];
};

export type Application2DbConfigResolution = {
  candidates: Application2DbConfigCandidate[];
  diagnostics: string[];
};

const DB_ENV_SOURCES: readonly DbEnvSource[] = [
  { namespace: "APP2_DB_*", prefix: "APP2_DB", label: "application2 DB" },
  { namespace: "EXPORT_DB_*", prefix: "EXPORT_DB", label: "export DB" },
  { namespace: "DB_*", prefix: "DB", label: "root DB" }
];

const REQUIRED_DB_KEYS = ["SERVER", "DATABASE", "USER", "PASSWORD"] as const;

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

function envName(source: DbEnvSource, key: string): string {
  return `${source.prefix}_${key}`;
}

function sourceHasAnyRequiredValue(source: DbEnvSource): boolean {
  return REQUIRED_DB_KEYS.some((key) => envValue(envName(source, key)));
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

function buildConfigFromSource(source: DbEnvSource): sql.config {
  const server = requireEnvValue(envName(source, "SERVER"), `${source.label} server`);
  const database = requireEnvValue(envName(source, "DATABASE"), `${source.label} database`);
  const user = requireEnvValue(envName(source, "USER"), `${source.label} user`);
  const password = requireEnvValue(envName(source, "PASSWORD"), `${source.label} password`);
  const port = parseNumberEnv(envName(source, "PORT"), envValue(envName(source, "PORT")), 1433);
  const encrypt = parseBooleanEnv(envName(source, "ENCRYPT"), envValue(envName(source, "ENCRYPT")), false);
  const trustServerCertificate = parseBooleanEnv(
    envName(source, "TRUST_SERVER_CERTIFICATE"),
    envValue(envName(source, "TRUST_SERVER_CERTIFICATE")),
    true
  );
  const requestTimeout = parseNumberEnv(
    envName(source, "REQUEST_TIMEOUT_MS"),
    envValue(envName(source, "REQUEST_TIMEOUT_MS")),
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

export function getApplication2DbConfigResolutionFromEnv(): Application2DbConfigResolution {
  const candidates: Application2DbConfigCandidate[] = [];
  const diagnostics: string[] = [];
  const skippedErrors: Error[] = [];

  for (const source of DB_ENV_SOURCES) {
    if (!sourceHasAnyRequiredValue(source)) continue;

    try {
      candidates.push({
        config: buildConfigFromSource(source),
        namespace: source.namespace
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skippedErrors.push(error instanceof Error ? error : new Error(message));
      diagnostics.push(
        `Application 2 DB warning: ${source.namespace} is partially or invalidly configured and will be skipped. ${message}`
      );
    }
  }

  if (candidates.length === 0) {
    if (skippedErrors[0]) throw skippedErrors[0];
    throw new Error("application2 DB server is required (APP2_DB_SERVER)");
  }

  const selected = candidates[0]!;
  if (selected.namespace !== "APP2_DB_*") {
    diagnostics.push(
      `Application 2 DB info: APP2_DB_* is not fully configured; using ${selected.namespace} fallback.`
    );
  }

  return { candidates, diagnostics };
}

export function getApplication2DbConfigFromEnv(): sql.config {
  return getApplication2DbConfigResolutionFromEnv().candidates[0]!.config;
}

function writeDbLog(message: string) {
  process.stderr.write(`${message}\n`);
}

export async function getApplication2Pool(): Promise<DbPool> {
  const cached = poolCache.get("application2");
  if (cached) return cached;

  const resolution = getApplication2DbConfigResolutionFromEnv();
  for (const diagnostic of resolution.diagnostics) {
    writeDbLog(diagnostic);
  }

  const attempted: string[] = [];
  for (const [index, candidate] of resolution.candidates.entries()) {
    attempted.push(candidate.namespace);

    try {
      const pool = await new sql.ConnectionPool(candidate.config).connect();
      poolCache.set("application2", pool);
      return pool;
    } catch {
      const next = resolution.candidates[index + 1];
      writeDbLog(
        next
          ? `Application 2 DB warning: connection failed for ${candidate.namespace}; trying ${next.namespace}.`
          : `Application 2 DB warning: connection failed for ${candidate.namespace}; no fallback remains.`
      );
    }
  }

  throw new Error(`Application 2 database connection failed after trying ${attempted.join(", ")}.`);
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
