import { type DbPool, execSql, sql } from "../db_connect.js";

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

export const LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES = ["ASSESSMENT", "FIELD", "RESPONSE"] as const;

export type SupportedDatabaseSchema = "application2" | "legacy_alpha1";

type TableName =
  | (typeof APPLICATION2_REQUIRED_DATABASE_TABLES)[number]
  | (typeof LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES)[number];

export type DatabaseSchemaDetection = {
  database: string;
  schema: SupportedDatabaseSchema;
  tables: Record<string, boolean>;
};

const SUPPORTED_TABLES = Array.from(
  new Set<TableName>([...APPLICATION2_REQUIRED_DATABASE_TABLES, ...LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES])
);

function tableMap(requiredTables: readonly string[], found: Set<string>): Record<string, boolean> {
  return Object.fromEntries(requiredTables.map((table) => [table, found.has(table)]));
}

function missingTables(requiredTables: readonly string[], found: Set<string>): string[] {
  return requiredTables.filter((table) => !found.has(table));
}

export async function detectSupportedDatabaseSchema(pool: DbPool): Promise<DatabaseSchemaDetection> {
  const dbResult = await execSql(pool, "SELECT DB_NAME() AS database_name");
  const database = String(
    (dbResult.recordset as Array<{ database_name: unknown }>)[0]?.database_name ?? ""
  );

  const params: Record<string, { type: unknown; value: unknown }> = {
    schema: { type: sql.NVarChar(128), value: "dbo" }
  };
  const placeholders = SUPPORTED_TABLES.map((table, index) => {
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
  const app2Missing = missingTables(APPLICATION2_REQUIRED_DATABASE_TABLES, found);
  if (app2Missing.length === 0) {
    return {
      database,
      schema: "application2",
      tables: tableMap(APPLICATION2_REQUIRED_DATABASE_TABLES, found)
    };
  }

  const legacyMissing = missingTables(LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES, found);
  if (legacyMissing.length === 0) {
    return {
      database,
      schema: "legacy_alpha1",
      tables: tableMap(LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES, found)
    };
  }

  throw new Error(`Missing required database tables: ${app2Missing.join(", ")}`);
}
