export type EnumPair = {
  code: string;
  meaning: string;
};

export type ValuesSpecKind =
  | "text"
  | "date_yyyymmdd"
  | "dodid10"
  | "enum"
  | "enum_yn"
  | "constant"
  | "spec_raw";

export type ValuesSpecAnalysis = {
  kind: ValuesSpecKind;
  raw: string;
  enum_pairs?: EnumPair[];
  literal_constant?: string;
};

export function normalizeValuesSpecRaw(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

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

    const code = p.slice(0, eq).trim().replace(/^"+|"+$/g, "");
    const meaning = p.slice(eq + 1).trim().replace(/^"+|"+$/g, "");
    if (code) pairs.push({ code, meaning });
  }

  return pairs.length ? pairs : undefined;
}

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

export function inferNumericTemplateWidth(raw: string | null | undefined): number | undefined {
  const s = normalizeValuesSpecRaw(raw);
  if (!s) return undefined;
  if (!/^[9]+$/.test(s)) return undefined;
  return s.length;
}

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
