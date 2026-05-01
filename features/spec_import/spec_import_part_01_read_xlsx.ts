import * as XLSX from "xlsx";

/**
 * Represents a field row from an exported specification.
 * Contains metadata about a field including its position, name, and validation information.
 * 
 * @typedef {Object} ExportFieldRow
 * @property {number} order - The ordinal position of the field in the specification.
 * @property {string | null} question_code - The code identifier for the associated question, or null if not applicable.
 * @property {string} field_name - The name of the field.
 * @property {number} length - The length of the field in characters.
 * @property {number} start_pos - The starting position of the field in the data structure.
 * @property {number} end_pos - The ending position of the field in the data structure.
 * @property {string | null} description - A description of the field, or null if not provided.
 * @property {string | null} values_spec_raw - Raw specification of valid values for the field, or null if not specified.
 */
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

/**
 * Represents an exported specification model parsed from a source file.
 *
 * @remarks
 * This model contains identifying metadata for the specification and
 * the complete list of field definitions included in the export.
 *
 * @property spec_name - The human-readable name of the specification.
 * @property spec_version - The version identifier of the specification.
 * @property row_length - The total number of rows in the specification source.
 * @property fields - The collection of exported field rows associated with this specification.
 */
export type ExportSpecModel = {
  spec_name: string;
  spec_version: string;
  row_length: number;
  fields: ExportFieldRow[];
};

/**
 * Normalizes a header key by removing whitespace characters and converting to uppercase.
 * @param k - The key string to normalize
 * @returns The normalized key with all spaces, tabs, and newlines removed and converted to uppercase
 */
function normKey(k: string): string {
  // Normalize header keys: remove spaces + tabs + newlines, uppercase
  return String(k).toUpperCase().replace(/[\s\r\n]+/g, "");
}

/**
 * Builds a Map from an object row, normalizing its keys.
 * @param row - The object containing key-value pairs to be converted into a Map
 * @returns A Map with normalized keys mapped to their original values
 */
function buildKeyMap(row: Record<string, any>): Map<string, any> {
  const m = new Map<string, any>();
  for (const [k, v] of Object.entries(row)) {
    m.set(normKey(k), v);
  }
  return m;
}

/**
 * Converts a value to a number and validates that it is finite.
 * @param v - The value to convert to a number
 * @param label - A label describing the value, used in error messages
 * @returns The converted number
 * @throws {Error} If the value cannot be converted to a finite number
 */
function mustNum(v: any, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Expected number for ${label}, got: ${v}`);
  return n;
}

/**
 * Retrieves a value from a row map by searching through a list of keys.
 * @param rowMap - A map containing normalized keys and their associated values
 * @param keys - An array of keys to search for in the row map
 * @param label - A label identifying the context or purpose of the lookup (currently unused)
 * @returns The value associated with the first matching normalized key, or undefined if no key is found
 */
function getVal(rowMap: Map<string, any>, keys: string[], label: string): any {
  for (const k of keys) {
    const nk = normKey(k);
    if (rowMap.has(nk)) return rowMap.get(nk);
  }
  return undefined;
}

/**
 * Reads and parses an XLSX file containing export specification data.
 * 
 * Extracts field definitions from the first sheet of the workbook, including
 * order, field name, position information, question codes, descriptions, and value specifications.
 * 
 * @param filePath - The file path to the XLSX file to read
 * @param spec_name - The name of the specification
 * @param spec_version - The version of the specification
 * @returns An ExportSpecModel containing the parsed specification metadata and field rows
 * @throws {Error} If the XLSX file has no sheets or if required fields contain invalid data
 * 
 * @example
 * ```typescript
 * const spec = readExportSpecXlsx('./spec.xlsx', 'MySpec', '1.0');
 * ```
 */
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
