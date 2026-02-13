import sql from "mssql";

export type DbPool = sql.ConnectionPool;

let _pool: DbPool | null = null;

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
      encrypt: false, // local Linux SQL Server commonly uses no TLS
      trustServerCertificate: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000
    }
  };
}

export async function getPool(): Promise<DbPool> {
  if (_pool) return _pool;
  const cfg = getDbConfigFromEnv();
  _pool = await new sql.ConnectionPool(cfg).connect();
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

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
