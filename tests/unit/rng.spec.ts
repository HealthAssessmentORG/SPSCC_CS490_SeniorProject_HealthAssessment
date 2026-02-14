import { test, expect } from "@playwright/test";
import { Rng } from "../../features/generator/generator_part_01_rng";

test.describe("Rng (xorshift32)", () => {
  test("is deterministic for the same seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);

    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());

    expect(seqA).toEqual(seqB);
  });

  test("int(min,max) stays within bounds", () => {
    const rng = new Rng(42);
    for (let i = 0; i < 500; i++) {
      const n = rng.int(7, 13);
      expect(n).toBeGreaterThanOrEqual(7);
      expect(n).toBeLessThanOrEqual(13);
    }
  });

  test("digits(n) returns exactly n numeric chars", () => {
    const rng = new Rng(999);
    const s = rng.digits(10);
    expect(s).toHaveLength(10);
    expect(s).toMatch(/^\d{10}$/);
  });

  test("alpha(n) returns exactly n uppercase alpha chars", () => {
    const rng = new Rng(999);
    const s = rng.alpha(12);
    expect(s).toHaveLength(12);
    expect(s).toMatch(/^[A-Z]{12}$/);
  });
});
