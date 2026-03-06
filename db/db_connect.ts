import sql from "mssql";

/**
 * Represents a SQL Server connection pool type.
 * @typedef {sql.ConnectionPool} DbPool
 */
export type DbPool = sql.ConnectionPool;

/**
 * Database connection pool instance.
 * Stores a singleton instance of the database pool, or null if not yet initialized.
 * @type {DbPool | null}
 */
let _pool: DbPool | null = null;

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
export function getDbConfigFromEnv(): sql.config {
  const server = process.env.DB_SERVER ?? "localhost";
  const port = Number(process.env.DB_PORT ?? "1433");
  const database = process.env.DB_DATABASE ?? "master";
  const user = process.env.DB_USER ?? "sa";
  const password = process.env.DB_PASSWORD ?? "";

  if (!password) {
    throw new Error("DB_PASSWORD is required");
  }

  console.log("[db] connect", {
    server, port, database, user,
    encrypt: false,
    trustServerCertificate: true,
    pwdLen: password.length
  });


  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt: false, // local Linux SQL Server commonly uses no TLS (needs to be changed if used accross the net)
      trustServerCertificate: true
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
export async function getPool(): Promise<DbPool> {
  if (_pool) return _pool;
  const cfg = getDbConfigFromEnv();
  _pool = await new sql.ConnectionPool(cfg).connect();
  return _pool;
}

/**
 * Closes the active database connection pool if it exists.
 *
 * If a pool is currently initialized, this function awaits its shutdown
 * and then clears the internal pool reference.
 *
 * @returns A promise that resolves when the pool has been closed (if present).
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
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
  pool: DbPool,
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
