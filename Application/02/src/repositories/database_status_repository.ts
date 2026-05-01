import { type DbPool, execSql, sql } from "../db_connect";
import type { Application2DatabaseStatus } from "../types";

export const APPLICATION2_REQUIRED_DATABASE_TABLES = [
  "RUN",
  "ASSESSMENT",
  "DEPLOYER",
  "RESPONSE",
  "PROVIDER_REVIEW",
  "EXPORT_SPEC",
  "EXPORT_FIELD",
  "MAPPING_SET",
  "MAPPING_RULE",
  "EXPORT_FILE",
  "VALIDATION_ERROR"
] as const;

export async function loadDatabaseStatus(pool: DbPool): Promise<Application2DatabaseStatus> {
  const dbResult = await execSql(pool, "SELECT DB_NAME() AS database_name");
  const database = String(
    (dbResult.recordset as Array<{ database_name: unknown }>)[0]?.database_name ?? ""
  );

  const params: Record<string, { type: unknown; value: unknown }> = {
    schema: { type: sql.NVarChar(128), value: "dbo" }
  };
  const placeholders = APPLICATION2_REQUIRED_DATABASE_TABLES.map((table, index) => {
    const key = `table${index}`;
    params[key] = { type: sql.NVarChar(128), value: table };
    return `@${key}`;
  });

  const tableResult = await execSql(
    pool,
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME IN (${placeholders.join(", ")})
    `,
    params
  );

  const found = new Set(
    (tableResult.recordset as Array<{ TABLE_NAME: unknown }>).map((row) => String(row.TABLE_NAME))
  );
  const tables: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const table of APPLICATION2_REQUIRED_DATABASE_TABLES) {
    const exists = found.has(table);
    tables[table] = exists;
    if (!exists) missing.push(table);
  }

  if (missing.length > 0) {
    throw new Error(`Missing required database tables: ${missing.join(", ")}`);
  }

  return { database, tables };
}
