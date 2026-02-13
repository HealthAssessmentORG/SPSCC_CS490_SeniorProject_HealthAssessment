export type SourceExpr =
  | { kind: "col"; table: "ASSESSMENT" | "DEPLOYER" | "PROVIDER_REVIEW"; column: string }
  | { kind: "resp"; question_code: string; field_name: string };

export type TransformOp =
  | { kind: "trim" }
  | { kind: "lower" }
  | { kind: "date_yyyymmdd" };

export type PadRule =
  | { kind: "none" }
  | { kind: "right_space" }
  | { kind: "left_zero" };

export type ParsedRule = {
  export_field_id: string;
  source: SourceExpr;
  transforms: TransformOp[];
  pad: PadRule;
  default_value: string;
};

export function parseSourceExpression(src: string): SourceExpr {
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

export function parsePadRule(p: string | null): PadRule {
  const s = (p ?? "").trim();
  if (!s) return { kind: "none" };
  if (s === "pad:right:space") return { kind: "right_space" };
  if (s === "pad:left:0") return { kind: "left_zero" };
  return { kind: "none" };
}
