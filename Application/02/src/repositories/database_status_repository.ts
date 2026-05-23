import { type DbPool } from "../db_connect.js";
import type { Application2DatabaseStatus } from "../types.js";
import {
  APPLICATION2_REQUIRED_DATABASE_OBJECTS,
  APPLICATION2_REQUIRED_DATABASE_TABLES,
  APPLICATION2_REQUIRED_DATABASE_VIEWS,
  detectSupportedDatabaseSchema
} from "./database_schema.js";

export {
  APPLICATION2_REQUIRED_DATABASE_OBJECTS,
  APPLICATION2_REQUIRED_DATABASE_TABLES,
  APPLICATION2_REQUIRED_DATABASE_VIEWS
};

export async function loadDatabaseStatus(pool: DbPool): Promise<Application2DatabaseStatus> {
  const schema = await detectSupportedDatabaseSchema(pool);
  return { database: schema.database, tables: schema.tables };
}
