import { promises as fs } from "node:fs";

import type { Application3ValidationField } from "./validation.js";

export type Application3OutputLayoutField = Application3ValidationField & {
  start_pos: number;
};

export type Application3OutputLayout = {
  row_length: number;
  fields: Application3OutputLayoutField[];
};

type RawLayout = {
  row_length?: unknown;
  fields?: unknown;
};

type RawField = {
  field_name?: unknown;
  start_pos?: unknown;
  length?: unknown;
  domain_type?: unknown;
};

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePositiveInteger(source: string, name: string, value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    fail(source, `${name} must be a positive integer`);
  }

  return Number(value);
}

function parseField(source: string, value: unknown, index: number): Application3OutputLayoutField {
  if (!isObject(value)) {
    fail(source, `fields[${index}] must be an object`);
  }

  const raw = value as RawField;
  if (typeof raw.field_name !== "string" || raw.field_name.trim().length === 0) {
    fail(source, `fields[${index}].field_name must be a nonblank string`);
  }

  const domainType = raw.domain_type;
  if (domainType !== null && domainType !== undefined && typeof domainType !== "string") {
    fail(source, `fields[${index}].domain_type must be a string or null`);
  }

  return {
    field_name: raw.field_name,
    start_pos: requirePositiveInteger(source, `fields[${index}].start_pos`, raw.start_pos),
    length: requirePositiveInteger(source, `fields[${index}].length`, raw.length),
    domain_type: domainType ?? null
  };
}

function sortFields(fields: Application3OutputLayoutField[]): Application3OutputLayoutField[] {
  return [...fields].sort((a, b) => a.start_pos - b.start_pos || a.field_name.localeCompare(b.field_name));
}

function validateFieldBounds(source: string, rowLength: number, fields: Application3OutputLayoutField[]): void {
  let previousEnd = 0;
  let previousName = "";

  for (const field of fields) {
    const fieldEnd = field.start_pos + field.length - 1;
    if (fieldEnd > rowLength) {
      fail(source, `${field.field_name} ends at ${fieldEnd}, beyond row_length ${rowLength}`);
    }

    if (field.start_pos <= previousEnd) {
      fail(source, `${field.field_name} overlaps ${previousName}`);
    }

    previousEnd = fieldEnd;
    previousName = field.field_name;
  }
}

export function parseOutputLayoutJson(text: string, source = "output layout"): Application3OutputLayout {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(source, "invalid JSON");
  }

  if (!isObject(parsed)) {
    fail(source, "layout must be a JSON object");
  }

  const raw = parsed as RawLayout;
  const rowLength = requirePositiveInteger(source, "row_length", raw.row_length);

  if (!Array.isArray(raw.fields)) {
    fail(source, "fields must be an array");
  }

  const fields = sortFields(raw.fields.map((field, index) => parseField(source, field, index)));
  validateFieldBounds(source, rowLength, fields);

  return {
    row_length: rowLength,
    fields
  };
}

export async function loadOutputLayout(path: string): Promise<Application3OutputLayout> {
  return parseOutputLayoutJson(await fs.readFile(path, "utf8"), path);
}
