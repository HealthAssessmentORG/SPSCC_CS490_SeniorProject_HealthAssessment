import { DbPool, execSql, sql } from "../../db/db_connect";
import { ExportSpecModel, ExportFieldRow } from "./spec_import_part_01_read_xlsx";
import { randomUUID } from "node:crypto";

type DomainGuess = {
  domain_type: string;
  raw_spec: string;
  enum_pairs?: Array<{ code: string; meaning: string }>;
};

function parseEnumPairs(raw: string): Array<{ code: string; meaning: string }> | undefined {
  // Handles patterns like: "M=Male, F=Female"
  if (!raw.includes("=")) return undefined;

  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const pairs: Array<{ code: string; meaning: string }> = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 1) continue;

    const code = p.slice(0, eq).trim().replace(/^"+|"+$/g, "");
    const meaning = p.slice(eq + 1).trim().replace(/^"+|"+$/g, "");
    if (code) pairs.push({ code, meaning });
  }

  return pairs.length ? pairs : undefined;
}

function guessDomain(f: ExportFieldRow): DomainGuess {
  const raw = (f.values_spec_raw ?? "").trim();

  if (!raw || raw.toLowerCase() === "text field") {
    return { domain_type: "TEXT", raw_spec: raw || "Text Field" };
  }

  if (raw.includes("YYYYMMDD") || /date/i.test(raw)) {
    return { domain_type: "DATE_YYYYMMDD", raw_spec: raw };
  }

  if (f.field_name.toUpperCase() === "DODID" || raw.includes("9999999999")) {
    return { domain_type: "DODID10", raw_spec: raw };
  }

  // Common “checked” domain
  if (/checked/i.test(raw) && raw.includes("Y") && raw.includes("N")) {
    return {
      domain_type: "ENUM_YN",
      raw_spec: raw,
      enum_pairs: [
        { code: "Y", meaning: "Yes" },
        { code: "N", meaning: "No" }
      ]
    };
  }

  const enumPairs = parseEnumPairs(raw);
  if (enumPairs) return { domain_type: "ENUM", raw_spec: raw, enum_pairs: enumPairs };

  return { domain_type: "SPEC_RAW", raw_spec: raw };
}

export async function upsertExportSpec(pool: DbPool, spec: ExportSpecModel): Promise<string> {
  const found = await execSql(
    pool,
    `
    SELECT TOP (1) export_spec_id
    FROM dbo.EXPORT_SPEC
    WHERE spec_name = @name AND spec_version = @ver
  `,
    {
      name: { type: sql.NVarChar(200), value: spec.spec_name },
      ver: { type: sql.NVarChar(50), value: spec.spec_version }
    }
  );

  if (found.recordset.length) {
    const id = String(found.recordset[0].export_spec_id);
    await execSql(
      pool,
      `
      UPDATE dbo.EXPORT_SPEC
      SET row_length = @rowlen
      WHERE export_spec_id = @id
    `,
      {
        rowlen: { type: sql.Int, value: spec.row_length },
        id: { type: sql.UniqueIdentifier, value: id }
      }
    );
    return id;
  }

  const id = randomUUID();
  await execSql(
    pool,
    `
    INSERT INTO dbo.EXPORT_SPEC (export_spec_id, spec_name, spec_version, row_length)
    VALUES (@id, @name, @ver, @rowlen)
  `,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      name: { type: sql.NVarChar(200), value: spec.spec_name },
      ver: { type: sql.NVarChar(50), value: spec.spec_version },
      rowlen: { type: sql.Int, value: spec.row_length }
    }
  );

  return id;
}

async function upsertDomain(pool: DbPool, d: DomainGuess): Promise<string> {
  const found = await execSql(
    pool,
    `
    SELECT TOP (1) domain_id
    FROM dbo.VALUE_DOMAIN
    WHERE domain_type = @t AND raw_spec = @r
  `,
    {
      t: { type: sql.NVarChar(50), value: d.domain_type },
      r: { type: sql.NVarChar(4000), value: d.raw_spec }
    }
  );

  if (found.recordset.length) return String(found.recordset[0].domain_id);

  const id = randomUUID();
  await execSql(
    pool,
    `
    INSERT INTO dbo.VALUE_DOMAIN (domain_id, domain_type, raw_spec)
    VALUES (@id, @t, @r)
  `,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      t: { type: sql.NVarChar(50), value: d.domain_type },
      r: { type: sql.NVarChar(4000), value: d.raw_spec }
    }
  );

  return id;
}

async function upsertEnumValues(
  pool: DbPool,
  domainId: string,
  pairs: Array<{ code: string; meaning: string }>
) {
  for (const p of pairs) {
    await execSql(
      pool,
      `
      IF NOT EXISTS (
        SELECT 1 FROM dbo.DOMAIN_ENUM_VALUE WHERE domain_id = @did AND code = @code
      )
      INSERT INTO dbo.DOMAIN_ENUM_VALUE (domain_enum_value_id, domain_id, code, meaning)
      VALUES (@id, @did, @code, @meaning)
    `,
      {
        id: { type: sql.UniqueIdentifier, value: randomUUID() },
        did: { type: sql.UniqueIdentifier, value: domainId },
        code: { type: sql.NVarChar(50), value: p.code },
        meaning: { type: sql.NVarChar(200), value: p.meaning }
      }
    );
  }
}

export async function replaceExportFields(pool: DbPool, exportSpecId: string, fields: ExportFieldRow[]) {
  // IMPORTANT:
  // FK_MAPPING_RULE_FIELD is NO ACTION (to avoid multiple cascade paths).
  // Therefore we must delete dependent MAPPING_RULE rows before deleting EXPORT_FIELD rows.

  // 1) Delete mapping rules via mapping-set (covers rules for the spec regardless of field IDs)
  await execSql(
    pool,
    `
    DELETE mr
    FROM dbo.MAPPING_RULE mr
    JOIN dbo.MAPPING_SET ms ON ms.mapping_set_id = mr.mapping_set_id
    WHERE ms.export_spec_id = @sid;
  `,
    { sid: { type: sql.UniqueIdentifier, value: exportSpecId } }
  );

  // 2) Also delete mapping rules via export-field join (belt + suspenders)
  await execSql(
    pool,
    `
    DELETE mr
    FROM dbo.MAPPING_RULE mr
    WHERE mr.export_field_id IN (
      SELECT ef.export_field_id
      FROM dbo.EXPORT_FIELD ef
      WHERE ef.export_spec_id = @sid
    );
  `,
    { sid: { type: sql.UniqueIdentifier, value: exportSpecId } }
  );

  // 3) Now it is safe to replace export fields for this spec
  await execSql(pool, `DELETE FROM dbo.EXPORT_FIELD WHERE export_spec_id = @sid`, {
    sid: { type: sql.UniqueIdentifier, value: exportSpecId }
  });

  // Insert the new set
  for (const f of fields) {
    const dom = guessDomain(f);
    const domainId = await upsertDomain(pool, dom);
    if (dom.enum_pairs) await upsertEnumValues(pool, domainId, dom.enum_pairs);

    await execSql(
      pool,
      `
      INSERT INTO dbo.EXPORT_FIELD (
        export_field_id, export_spec_id, domain_id, field_order, question_code, field_name,
        start_pos, end_pos, description, values_spec_raw
      )
      VALUES (
        @id, @sid, @did, @ord, @q, @name,
        @sp, @ep, @desc, @raw
      )
    `,
      {
        id: { type: sql.UniqueIdentifier, value: randomUUID() },
        sid: { type: sql.UniqueIdentifier, value: exportSpecId },
        did: { type: sql.UniqueIdentifier, value: domainId },
        ord: { type: sql.Int, value: f.order },
        q: { type: sql.NVarChar(50), value: f.question_code ?? null },
        name: { type: sql.NVarChar(100), value: f.field_name },
        sp: { type: sql.Int, value: f.start_pos },
        ep: { type: sql.Int, value: f.end_pos },
        desc: { type: sql.NVarChar(1000), value: f.description ?? null },
        raw: { type: sql.NVarChar(4000), value: f.values_spec_raw ?? null }
      }
    );
  }
}

export async function importSpecToDb(pool: DbPool, spec: ExportSpecModel): Promise<string> {
  const exportSpecId = await upsertExportSpec(pool, spec);
  await replaceExportFields(pool, exportSpecId, spec.fields);
  return exportSpecId;
}
