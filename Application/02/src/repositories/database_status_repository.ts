import { type DbPool } from "../db_connect.js";
import type { Application2DatabaseStatus } from "../types.js";
import {
  APPLICATION2_REQUIRED_DATABASE_TABLES,
  detectSupportedDatabaseSchema
} from "./database_schema.js";

export { APPLICATION2_REQUIRED_DATABASE_TABLES };

export async function loadDatabaseStatus(pool: DbPool): Promise<Application2DatabaseStatus> {
  const schema = await detectSupportedDatabaseSchema(pool);
  return { database: schema.database, tables: schema.tables };
}
