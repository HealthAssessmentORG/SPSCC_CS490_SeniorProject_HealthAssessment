import sql from "mssql";

/**
 * Represents a SQL Server connection pool type.
 * @typedef {sql.ConnectionPool} DbPool
 */
export type DbPool = sql.ConnectionPool;
/**
 * Represents the context for a database request, which can be either a connection pool or an active transaction.
 * @typedef {DbPool | sql.Transaction} DbRequestContext
 * @typedef {"alpha1" | "export"} DbConnectionTarget - Enum for database connection targets
 */
export type DbRequestContext = DbPool | sql.Transaction;
/**
 * Defines the possible targets for database connections, allowing for multiple configurations (e.g., "alpha1" and "export").
 * This type can be extended in the future to support additional targets as needed.
 * @typedef {"alpha1" | "export"} DbConnectionTarget
 */
export type DbConnectionTarget = "alpha1" | "export";

/**
 * Database connection pool instance.
 * Stores a singleton instance of the database pool, or null if not yet initialized.
 * @type {DbPool | null}
 */
const poolCache = new Map<DbConnectionTarget, DbPool>();

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

function firstEnvValue(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value != null && value.trim() !== "") return value;
  }
  return undefined;
}

function requireEnvValue(names: string[], label: string): string {
  const value = firstEnvValue(names);
  if (!value) {
    throw new Error(`${label} is required (${names.join(" or ")})`);
  }
  return value;
}

function envNamesForTarget(target: DbConnectionTarget) {
  if (target === "export") {
    return {
      server: ["EXPORT_DB_SERVER"],
      port: ["EXPORT_DB_PORT"],
      database: ["EXPORT_DB_DATABASE"],
      user: ["EXPORT_DB_USER"],
      password: ["EXPORT_DB_PASSWORD"],
      encrypt: ["EXPORT_DB_ENCRYPT"],
      trustServerCertificate: ["EXPORT_DB_TRUST_SERVER_CERTIFICATE"],
      requestTimeout: ["EXPORT_DB_REQUEST_TIMEOUT_MS"]
    };
  }

  return {
    server: ["DB_SERVER"],
    port: ["DB_PORT"],
    database: ["DB_DATABASE"],
    user: ["DB_USER"],
    password: ["DB_PASSWORD"],
    encrypt: ["DB_ENCRYPT"],
    trustServerCertificate: ["DB_TRUST_SERVER_CERTIFICATE"],
    requestTimeout: ["DB_REQUEST_TIMEOUT_MS"]
  };
}

export function getDbLogContext(cfg: sql.config) {
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

/**
 * Retrieves database configuration from environment variables.
 * 
 * @returns {sql.config} A configuration object for the mssql connection pool containing:
 * - server: Database server address (defaults to "localhost")
 * - port: Database server port (defaults to 1433)
 * - database: Database name (defaults to "master")
 * - user: Database user (defaults to "sa")
 * - password: Database password (required, no default)
 * - options: Connection options with encryption disabled and server certificate trusted
 * - pool: Connection pool settings with max 10 connections and 30 second idle timeout
 * 
 * @throws {Error} When DB_PASSWORD environment variable is not set
 * 
 * @remarks
 * This function logs the connection parameters (excluding the actual password) to the console.
 * The configuration is set for local development with encryption disabled, which should be
 * changed when deploying across a network.
 */
export function getDbConfigFromEnv(target: DbConnectionTarget = "alpha1"): sql.config {
  const names = envNamesForTarget(target);
  const server = requireEnvValue(names.server, `${target} DB server`);
  const database = requireEnvValue(names.database, `${target} DB database`);
  const user = requireEnvValue(names.user, `${target} DB user`);
  const password = requireEnvValue(names.password, `${target} DB password`);
  const port = parseNumberEnv(names.port[0], firstEnvValue(names.port), 1433);
  const encrypt = parseBooleanEnv(names.encrypt[0], firstEnvValue(names.encrypt), false);
  const trustServerCertificate = parseBooleanEnv(
    names.trustServerCertificate[0],
    firstEnvValue(names.trustServerCertificate),
    true
  );
  const requestTimeout = parseNumberEnv(names.requestTimeout[0], firstEnvValue(names.requestTimeout), 0);

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

/**
 * Retrieves or creates a database connection pool.
 * 
 * This function implements a singleton pattern for the database connection pool.
 * If a pool already exists, it returns the cached instance. Otherwise, it creates
 * a new connection pool using the database configuration from environment variables.
 * 
 * @returns {Promise<DbPool>} A promise that resolves to the database connection pool
 * @throws {Error} May throw an error if the database connection fails
 */
export async function getPool(target: DbConnectionTarget = "alpha1"): Promise<DbPool> {
  const cached = poolCache.get(target);
  if (cached) return cached;

  const cfg = getDbConfigFromEnv(target);
  console.error(`[db:${target}] connect`, getDbLogContext(cfg));

  const pool = await new sql.ConnectionPool(cfg).connect();
  poolCache.set(target, pool);
  return pool;
}

/**
 * Closes the active database connection pool if it exists.
 *
 * If a pool is currently initialized, this function awaits its shutdown
 * and then clears the internal pool reference.
 *
 * @returns A promise that resolves when the pool has been closed (if present).
 */
export async function closePool(target?: DbConnectionTarget): Promise<void> {
  if (target) {
    const pool = poolCache.get(target);
    if (!pool) return;
    await pool.close();
    poolCache.delete(target);
    return;
  }

  for (const [key, pool] of poolCache.entries()) {
    await pool.close();
    poolCache.delete(key);
  }
}

/**
 * Executes a SQL query against the provided database pool with optional parameters.
 * 
 * @param pool - The database connection pool to execute the query against
 * @param text - The SQL query text to execute
 * @param params - Optional record of named parameters where each key maps to an object containing the parameter's type and value
 * @returns A promise that resolves to the query result
 * 
 * @example
 * ```typescript
 * const result = await execSql(
 *   pool,
 *   'SELECT * FROM users WHERE id = @userId',
 *   { userId: { type: sql.Int, value: 123 } }
 * );
 * ```
 */
export async function execSql(
  pool: DbRequestContext,
  text: string,
  params?: Record<string, { type: any; value: any }>
) {
  const req = pool.request();
  if (params) {
    for (const [k, p] of Object.entries(params)) {
      req.input(k, p.type, p.value);
    }
  }
  return req.query(text);
}

export { sql };
