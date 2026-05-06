import { Rng } from "../generator/generator_part_01_rng.js";

export function hashString32(input: string): number {
  let h = 2166136261 >>> 0;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

export function seededRngFromParts(...parts: Array<string | number>): Rng {
  // const seed = hashString32(parts.map(String).join("|")) || 1;
  return new Rng(hashString32(parts.map(String).join("|")) || 1);
}

export function formatDateYyyymmdd(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10).replaceAll("-", "");
  }

  return value.replaceAll("-", "");
}

export function truncateValue(value: string, maxLength = 255): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}
