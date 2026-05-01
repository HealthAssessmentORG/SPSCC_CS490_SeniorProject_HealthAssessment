/**
 * Represents a normalized source expression used when parsing mapping rules.
 *
 * The expression can reference:
 * - A direct database column from a supported table (`kind: "col"`),
 * - A response field from a questionnaire item (`kind: "resp"`),
 * - Or a constant/literal source (`kind: "const"`).
 *
 * @remarks
 * - `col` sources are limited to the `ASSESSMENT`, `DEPLOYER`, and `PROVIDER_REVIEW` tables.
 * - `resp` sources identify a response by `question_code` and the specific `field_name` to read.
 * - `const` acts as a sentinel for fixed values that are not table/response-derived.
 */
export type SourceExpr =
  | { kind: "col"; table: "ASSESSMENT" | "DEPLOYER" | "PROVIDER_REVIEW"; column: string }
  | { kind: "resp"; question_code: string; field_name: string }
  | { kind: "const" };

/**
 * Defines supported value transformation operations used during mapping rule compilation.
 *
 * Each variant represents a normalized operation identified by its `kind`:
 * - `"trim"`: Removes leading and trailing whitespace.
 * - `"lower"`: Converts text to lowercase.
 * - `"date_yyyymmdd"`: Formats or normalizes a date value to `YYYYMMDD`.
 */
export type TransformOp =
  | { kind: "trim" }
  | { kind: "lower" }
  | { kind: "date_yyyymmdd" };

/**
 * Describes how a value should be padded when transformed during mapping compilation.
 *
 * - `"none"`: no padding is applied.
 * - `"right_space"`: pad on the right using space characters.
 * - `"left_zero"`: pad on the left using `0` characters.
 */
export type PadRule =
  | { kind: "none" }
  | { kind: "right_space" }
  | { kind: "left_zero" };

/**
 * Represents a parsed mapping rule that defines how to transform and export data.
 * 
 * @property {string} export_field_id - The identifier of the target export field
 * @property {SourceExpr} source - The source expression defining where the data originates
 * @property {TransformOp[]} transforms - Array of transformation operations to apply to the source data
 * @property {PadRule} pad - Padding rule to apply to the transformed data
 * @property {string} default_value - Default value to use when source data is not available
 */
export type ParsedRule = {
  export_field_id: string;
  source: SourceExpr;
  transforms: TransformOp[];
  pad: PadRule;
  default_value: string;
};

/**
 * Parses a serialized source expression string into a structured {@link SourceExpr} object.
 *
 * Supported formats:
 * - `"CONST"` → `{ kind: "const" }`
 * - `"COL:TABLE.column"` → `{ kind: "col", table, column }`
 * - `"RESP:Q:FIELD"` → `{ kind: "resp", question_code, field_name }`
 *
 * @param src - The source expression string to parse.
 * @returns A typed source expression object describing the parsed input.
 *
 * @throws {Error}
 * Thrown when:
 * - A `COL:` expression does not include a `.` separator after the table name.
 * - A `RESP:` expression does not contain exactly two `:`-separated segments after `RESP:`.
 * - The expression prefix is not recognized.
 */
export function parseSourceExpression(src: string): SourceExpr {
  if (src === "CONST") {
    return { kind: "const" };
  }
  if (src.startsWith("COL:")) {
    // COL:TABLE.column
    const rest = src.slice(4);
    const dot = rest.indexOf(".");
    if (dot < 0) throw new Error(`Bad COL source_expression: ${src}`);
    const table = rest.slice(0, dot) as any;
    const column = rest.slice(dot + 1);
    return { kind: "col", table, column };
  }
  if (src.startsWith("RESP:")) {
    // RESP:Q:FIELD
    const rest = src.slice(5);
    const parts = rest.split(":");
    if (parts.length !== 2) throw new Error(`Bad RESP source_expression: ${src}`);
    return { kind: "resp", question_code: parts[0], field_name: parts[1] };
  }
  throw new Error(`Unknown source_expression: ${src}`);
}

/**
 * Parses a transform pipeline string into a sequence of normalized transform operations.
 *
 * The input is split on `|`, each segment is trimmed, and empty segments are ignored.
 * Supported operations are:
 * - `trim`
 * - `lower`
 * - `date:yyyymmdd`
 *
 * @param p - Pipeline definition string (for example, `"trim | lower"`). If `null`, `undefined`, or blank, returns an empty array.
 * @returns An ordered array of {@link TransformOp} entries matching the pipeline.
 *
 * @throws {Error} Thrown when a pipeline segment does not match a supported operation.
 */
export function parseTransformPipeline(p: string | null): TransformOp[] {
  const s = (p ?? "").trim();
  if (!s) return [];
  const parts = s.split("|").map((x) => x.trim()).filter(Boolean);

  const ops: TransformOp[] = [];
  for (const part of parts) {
    if (part === "trim") ops.push({ kind: "trim" });
    else if (part === "lower") ops.push({ kind: "lower" });
    else if (part === "date:yyyymmdd") ops.push({ kind: "date_yyyymmdd" });
    else throw new Error(`Unknown transform op: ${part}`);
  }
  return ops;
}

/**
 * Parses a padding rule string into a normalized {@link PadRule} object.
 *
 * Supported values are:
 * - `"pad:right:space"` → `{ kind: "right_space" }`
 * - `"pad:left:0"` → `{ kind: "left_zero" }`
 *
 * Any `null`, empty, whitespace-only, or unrecognized value defaults to
 * `{ kind: "none" }`.
 *
 * @param p - The raw padding rule string to parse.
 * @returns The corresponding parsed {@link PadRule}.
 */
export function parsePadRule(p: string | null): PadRule {
  const s = (p ?? "").trim();
  if (!s) return { kind: "none" };
  if (s === "pad:right:space") return { kind: "right_space" };
  if (s === "pad:left:0") return { kind: "left_zero" };
  return { kind: "none" };
}
