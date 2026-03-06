import fs from "node:fs";
import path from "node:path";
import { DbPool, execSql } from "./db_connect";

/**
 * Splits a SQL script into individual batches separated by GO statements.
 * 
 * This function parses SQL text and splits it into separate batch commands based on
 * the presence of "GO" statements (case-insensitive). A "GO" statement is recognized
 * when it appears on its own line, optionally surrounded by whitespace.
 * 
 * @param sqlText - The SQL script text containing one or more batches separated by GO statements
 * @returns An array of SQL batch strings, with empty batches filtered out
 * 
 * @example
 * ```typescript
 * const sql = `
 *   CREATE TABLE Users (id INT);
 *   GO
 *   INSERT INTO Users VALUES (1);
 *   GO
 * `;
 * const batches = splitGoBatches(sql);
 * // Returns: ['CREATE TABLE Users (id INT);', 'INSERT INTO Users VALUES (1);']
 * ```
 */
function splitGoBatches(sqlText: string): string[] {
  // Splits on lines that contain only "GO" (case-insensitive)
  const lines = sqlText.split(/\r?\n/);
  const batches: string[] = [];
  let cur: string[] = [];

  for (const line of lines) {
    if (/^\s*GO\s*$/i.test(line)) {
      const joined = cur.join("\n").trim();
      if (joined) batches.push(joined);
      cur = [];
    } else {
      cur.push(line);
    }
  }

  const tail = cur.join("\n").trim();
  if (tail) batches.push(tail);

  return batches;
}

/**
 * Applies SQL commands from a file to the database by reading the file,
 * splitting it into batches separated by GO statements, and executing each batch.
 * 
 * @param pool - The database connection pool to execute queries against
 * @param filePath - The path to the SQL file to be applied
 * @returns A Promise that resolves when all SQL batches have been executed
 * @throws Will throw an error if the file cannot be read or if any SQL execution fails
 */
export async function applySqlFile(pool: DbPool, filePath: string) {
  const text = fs.readFileSync(filePath, "utf8");
  const batches = splitGoBatches(text);

  /* -- IGNORE --
  for (let i = 0; i < batches.length; i++) {
    await execSql(pool, batches[i]);
  }
  */

  for (const element of batches) {
    await execSql(pool, element);
  }
}

/**
 * Applies SQL schema files from a directory to the database.
 * 
 * Reads all files matching the pattern `00_*.sql` from the specified directory,
 * sorts them alphabetically, and executes them sequentially against the database pool.
 * 
 * @param pool - The database connection pool to execute SQL statements against
 * @param sqlDir - The directory path containing SQL schema files to apply
 * @returns A promise that resolves when all schema files have been applied
 * @throws Will throw an error if any SQL file fails to execute
 * 
 * @example
 * ```typescript
 * await applySchemaFromDir(pool, './sql/schema');
 * ```
 */
export async function applySchemaFromDir(pool: DbPool, sqlDir: string) {
  const files = fs
    .readdirSync(sqlDir)
    .filter((f) => /^00_.*\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));


  for (const f of files) {
    const fp = path.join(sqlDir, f);
    console.log(`[schema] applying ${fp}`);
    await applySqlFile(pool, fp);
  }
}
