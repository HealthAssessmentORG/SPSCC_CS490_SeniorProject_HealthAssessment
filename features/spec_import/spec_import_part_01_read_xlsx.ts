import * as XLSX from "xlsx";

export type ExportFieldRow = {
  order: number;
  question_code: string | null;
  field_name: string;
  length: number;
  start_pos: number;
  end_pos: number;
  description: string | null;
  values_spec_raw: string | null;
};

export type ExportSpecModel = {
  spec_name: string;
  spec_version: string;
  row_length: number;
  fields: ExportFieldRow[];
};

function normKey(k: string): string {
  // Normalize header keys: remove spaces + tabs + newlines, uppercase
  return String(k).toUpperCase().replace(/[\s\r\n]+/g, "");
}

function buildKeyMap(row: Record<string, any>): Map<string, any> {
  const m = new Map<string, any>();
  for (const [k, v] of Object.entries(row)) {
    m.set(normKey(k), v);
  }
  return m;
}

function mustNum(v: any, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Expected number for ${label}, got: ${v}`);
  return n;
}

function getVal(rowMap: Map<string, any>, keys: string[], label: string): any {
  for (const k of keys) {
    const nk = normKey(k);
    if (rowMap.has(nk)) return rowMap.get(nk);
  }
  return undefined;
}

export function readExportSpecXlsx(
  filePath: string,
  spec_name: string,
  spec_version: string
): ExportSpecModel {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("XLSX has no sheets");

  const ws = wb.Sheets[sheetName];

  // If debugging needed:
  // const preview = XLSX.utils.sheet_to_json<any>(ws, { defval: null, range: 0, blankrows: false });
  // console.log("XLSX keys preview:", preview[0] ? Object.keys(preview[0]) : "(no rows)");

  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null, blankrows: false });

  const fields: ExportFieldRow[] = [];

  for (const r of rows) {
    const m = buildKeyMap(r);

    const orderRaw = getVal(m, ["ORDER"], "ORDER");
    if (orderRaw == null) continue;

    const order = mustNum(orderRaw, "ORDER");

    const field_name = String(getVal(m, ["FIELDNAME", "FIELD_NAME"], "FIELDNAME") ?? "").trim();
    if (!field_name) {
      // Skip any odd rows that have ORDER but no fieldname
      continue;
    }

    const length = mustNum(getVal(m, ["LENGTH"], "LENGTH"), "LENGTH");
    const start_pos = mustNum(getVal(m, ["STARTPOS", "START_POS", "START POS"], "START POS"), "START POS");

    // END POS header is often wrapped; accept many variants:
    let endRaw = getVal(m, ["ENDPOS", "END_POS", "END POS", "END\r\nPOS", "END\nPOS"], "END POS");

    // If END POS is missing for any reason, infer it from start+length
    const end_pos = endRaw == null ? (start_pos + length - 1) : mustNum(endRaw, "END POS");

    const question_code_raw = getVal(m, ["QUESTION", "QUESTION_CODE"], "QUESTION");
    const question_code =
      question_code_raw != null && String(question_code_raw).trim() !== ""
        ? String(question_code_raw).trim()
        : null;

    const descRaw = getVal(m, ["DESCRIPTION", "DESC"], "DESCRIPTION");
    const valuesRaw = getVal(m, ["VALUES", "VALUE_SPEC", "VALUES_SPEC"], "VALUES");

    fields.push({
      order,
      question_code,
      field_name,
      length,
      start_pos,
      end_pos,
      description: descRaw != null ? String(descRaw) : null,
      values_spec_raw: valuesRaw != null ? String(valuesRaw) : null
    });
  }

  const row_length = fields.reduce((mx, f) => Math.max(mx, f.end_pos), 0);
  return { spec_name, spec_version, row_length, fields };
}
