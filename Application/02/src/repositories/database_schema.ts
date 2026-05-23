import { type DbPool, execSql, sql } from "../db_connect.js";

export const APPLICATION2_REQUIRED_DATABASE_TABLES = [
  "RUN",
  "ASSESSMENT",
  "DEPLOYER",
  "FIELD",
  "RESPONSE",
  "PROVIDER_REVIEW",
  "EXPORT_SPEC",
  "EXPORT_FIELD",
  "MAPPING_SET",
  "MAPPING_RULE",
  "EXPORT_FILE",
  "VALIDATION_ERROR"
] as const;

export const APPLICATION2_REQUIRED_DATABASE_VIEWS = ["vw_Response"] as const;

export const APPLICATION2_REQUIRED_DATABASE_OBJECTS = [
  ...APPLICATION2_REQUIRED_DATABASE_TABLES,
  ...APPLICATION2_REQUIRED_DATABASE_VIEWS
] as const;

export const LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES = ["ASSESSMENT", "FIELD", "RESPONSE"] as const;

export type SupportedDatabaseSchema = "application2" | "legacy_alpha1";

type DatabaseObjectName =
  | (typeof APPLICATION2_REQUIRED_DATABASE_OBJECTS)[number]
  | (typeof LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES)[number];

export type DatabaseSchemaDetection = {
  database: string;
  schema: SupportedDatabaseSchema;
  tables: Record<string, boolean>;
};

const SUPPORTED_DATABASE_OBJECTS = Array.from(
  new Set<DatabaseObjectName>([
    ...APPLICATION2_REQUIRED_DATABASE_OBJECTS,
    ...LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES
  ])
);

const LEGACY_SHARED_OBJECTS = new Set<string>(LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES);

function objectMap(requiredObjects: readonly string[], found: Set<string>): Record<string, boolean> {
  return Object.fromEntries(requiredObjects.map((objectName) => [objectName, found.has(objectName)]));
}

function missingObjects(requiredObjects: readonly string[], found: Set<string>): string[] {
  return requiredObjects.filter((objectName) => !found.has(objectName));
}

function describeMissingApplication2Objects(missing: string[]): string {
  const missingTables = missing.filter((objectName) =>
    (APPLICATION2_REQUIRED_DATABASE_TABLES as readonly string[]).includes(objectName)
  );
  const missingViews = missing.filter((objectName) =>
    (APPLICATION2_REQUIRED_DATABASE_VIEWS as readonly string[]).includes(objectName)
  );
  const parts: string[] = [];

  if (missingTables.length > 0) {
    parts.push(`tables ${missingTables.join(", ")}`);
  }
  if (missingViews.length > 0) {
    parts.push(`views ${missingViews.join(", ")}`);
  }

  return parts.join("; ");
}

function hasApplication2SpecificObject(found: Set<string>): boolean {
  return APPLICATION2_REQUIRED_DATABASE_OBJECTS.some(
    (objectName) => !LEGACY_SHARED_OBJECTS.has(objectName) && found.has(objectName)
  );
}

export async function detectSupportedDatabaseSchema(pool: DbPool): Promise<DatabaseSchemaDetection> {
  const dbResult = await execSql(pool, "SELECT DB_NAME() AS database_name");
  const database = String(
    (dbResult.recordset as Array<{ database_name: unknown }>)[0]?.database_name ?? ""
  );

  const params: Record<string, { type: unknown; value: unknown }> = {
    schema: { type: sql.NVarChar(128), value: "dbo" }
  };
  const placeholders = SUPPORTED_DATABASE_OBJECTS.map((objectName, index) => {
    const key = `table${index}`;
    params[key] = { type: sql.NVarChar(128), value: objectName };
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
  const app2Missing = missingObjects(APPLICATION2_REQUIRED_DATABASE_OBJECTS, found);
  if (app2Missing.length === 0) {
    return {
      database,
      schema: "application2",
      tables: objectMap(APPLICATION2_REQUIRED_DATABASE_OBJECTS, found)
    };
  }

  const legacyMissing = missingObjects(LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES, found);
  if (legacyMissing.length === 0 && !hasApplication2SpecificObject(found)) {
    return {
      database,
      schema: "legacy_alpha1",
      tables: objectMap(LEGACY_ALPHA1_REQUIRED_DATABASE_TABLES, found)
    };
  }

  throw new Error(
    `Missing required Application 2 database objects: ${describeMissingApplication2Objects(app2Missing)}`
  );
}
