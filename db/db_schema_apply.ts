import fs from "node:fs";
import path from "node:path";
import { DbPool, execSql } from "./db_connect";

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
