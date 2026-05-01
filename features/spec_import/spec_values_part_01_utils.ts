/**
 * Represents a code-meaning pair for enumeration values.
 * @property {string} code - The enumeration code or identifier.
 * @property {string} meaning - The human-readable meaning or description of the code.
 */
export type EnumPair = {
  code: string;
  meaning: string;
};

/**
 * Represents the different kinds of value specifications supported in the import feature.
 * 
 * @typedef ValuesSpecKind
 * @type {string}
 * 
 * @property {"text"} text - Plain text value
 * @property {"date_yyyymmdd"} date_yyyymmdd - Date in YYYY-MM-DD format
 * @property {"dodid10"} dodid10 - Department of Defense ID (10 characters)
 * @property {"enum"} enum - Enumeration value
 * @property {"enum_yn"} enum_yn - Yes/No enumeration value
 * @property {"constant"} constant - Constant value
 * @property {"spec_raw"} spec_raw - Raw specification value
 */
export type ValuesSpecKind =
  | "text"
  | "date_yyyymmdd"
  | "dodid10"
  | "enum"
  | "enum_yn"
  | "constant"
  | "spec_raw";

/**
 * Represents the analysis of a values specification.
 * @typedef {Object} ValuesSpecAnalysis
 * @property {ValuesSpecKind} kind - The kind of values specification.
 * @property {string} raw - The raw specification string.
 * @property {EnumPair[]} [enum_pairs] - Optional array of enum pairs.
 * @property {string} [literal_constant] - Optional literal constant value.
 */
export type ValuesSpecAnalysis = {
  kind: ValuesSpecKind;
  raw: string;
  enum_pairs?: EnumPair[];
  literal_constant?: string;
};

/**
 * Normalizes a raw spec value by converting it to a string and trimming whitespace.
 * @param raw - The raw value to normalize, can be a string, null, or undefined.
 * @returns The normalized string value with leading and trailing whitespace removed.
 */
export function normalizeValuesSpecRaw(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

/**
 * Parses a comma-separated list of `code=meaning` entries into structured enum pairs.
 *
 * Each entry is trimmed, and surrounding double quotes are removed from both the
 * `code` and `meaning` values. Entries without a valid `=` separator (or with an
 * empty code) are ignored.
 *
 * @param raw - Raw text containing comma-separated enum mappings (for example:
 * `"A"="Active", "I"="Inactive"`).
 * @returns An array of parsed `{ code, meaning }` pairs, or `undefined` when no
 * valid pairs are found or when the input does not contain `=`.
 */
export function parseEnumPairs(raw: string): EnumPair[] | undefined {
  if (!raw.includes("=")) return undefined;

  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const pairs: EnumPair[] = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 1) continue;

    const code = p.slice(0, eq).trim().replaceAll(/^"+|"+$/g, "");
    const meaning = p.slice(eq + 1).trim().replaceAll(/^"+|"+$/g, "");
    
    if (code) pairs.push({ code, meaning });
  }

  return pairs.length ? pairs : undefined;
}

/**
 * Extracts a likely literal constant value from a raw values-spec string.
 *
 * Normalizes the input first, then filters out placeholders and non-literal patterns.
 * Returns `undefined` when the value appears to be a field descriptor, date format,
 * checkbox indicator, expression, generic mask, or broad type label.
 *
 * Filtered examples include:
 * - `"text field"`
 * - date-like placeholders such as `"yyyy mm dd"`
 * - values containing `"checked"`
 * - values containing `"="`
 * - mask-like strings of only `9`/`X` with length 4+ (for example, `"9999"` or `"XXXX"`)
 * - `"alphanumeric"`
 *
 * @param raw - Raw value specification text to evaluate.
 * @returns The normalized literal constant when valid; otherwise `undefined`.
 */
export function extractLiteralConstant(raw: string | null | undefined): string | undefined {
  const s = normalizeValuesSpecRaw(raw);
  if (!s) return undefined;

  if (/^text\s*field$/i.test(s)) return undefined;
  if (/yyyy\s*mm\s*dd/i.test(s)) return undefined;
  if (/checked/i.test(s)) return undefined;
  if (s.includes("=")) return undefined;
  if (/^[9X]{4,}$/i.test(s)) return undefined;
  if (/^alphanumeric$/i.test(s)) return undefined;

  return s;
}

/**
 * Infers the numeric template width from a raw string value.
 * @param raw - The raw string value to analyze, or null/undefined
 * @returns The width (length) of the numeric template if the normalized string consists only of '9' characters, otherwise undefined
 */
export function inferNumericTemplateWidth(raw: string | null | undefined): number | undefined {
  const s = normalizeValuesSpecRaw(raw);
  if (!s) return undefined;
  if (!/^[9]+$/.test(s)) return undefined;
  return s.length;
}

/**
 * Classifies a specification value field based on its name and raw value content.
 * 
 * @param fieldName - The name of the field to classify
 * @param raw - The raw specification value, which may be a string, null, or undefined
 * @returns A `ValuesSpecAnalysis` object describing the classification and parsed content of the field
 * 
 * @remarks
 * The function performs the following classification checks in order:
 * 1. Text fields - matches empty/null values or "text field" pattern
 * 2. Date fields - detects "YYYYMMDD" format or "date" keyword
 * 3. DOD ID fields - matches field name "DODID" or contains "9999999999"
 * 4. Enumerations - parses comma/semicolon-separated code-value pairs, with special handling for Y/N pairs
 * 5. Literal constants - extracts quoted constant values
 * 6. Raw specification - returns unparsed specification as fallback
 * 
 * @example
 * ```typescript
 * classifyValuesSpec("status", "Active=1; Inactive=0");
 * // Returns: { kind: "enum", raw: "Active=1; Inactive=0", enum_pairs: [...] }
 * 
 * classifyValuesSpec("DODID", "9999999999");
 * // Returns: { kind: "dodid10", raw: "9999999999" }
 * ```
 */
export function classifyValuesSpec(fieldName: string, raw: string | null | undefined): ValuesSpecAnalysis {
  const s = normalizeValuesSpecRaw(raw);
  const upperField = fieldName.trim().toUpperCase();

  if (!s || /^text\s*field$/i.test(s)) {
    return { kind: "text", raw: s || "Text Field" };
  }

  if (s.includes("YYYYMMDD") || /date/i.test(s)) {
    return { kind: "date_yyyymmdd", raw: s };
  }

  if (upperField === "DODID" || s.includes("9999999999")) {
    return { kind: "dodid10", raw: s };
  }

  const enumPairs = parseEnumPairs(s);
  if (enumPairs) {
    const onlyYn =
      enumPairs.length === 2 &&
      enumPairs.some((x) => x.code.toUpperCase() === "Y") &&
      enumPairs.some((x) => x.code.toUpperCase() === "N");
    return {
      kind: onlyYn ? "enum_yn" : "enum",
      raw: s,
      enum_pairs: enumPairs
    };
  }

  const literal = extractLiteralConstant(s);
  if (literal != null) {
    return { kind: "constant", raw: s, literal_constant: literal };
  }

  return { kind: "spec_raw", raw: s };
}
