import { test, expect } from "@playwright/test";
import { Rng } from "../../features/generator/generator_part_01_rng";
import {
  buildAssessmentSeeds,
  buildDeployerDodIds,
} from "../../features/generator/generator_part_02_insert_assessments";
import {
  formatDateYyyymmdd,
  hashString32,
  seededRngFromParts,
  truncateValue,
} from "../../features/shared/deterministic_utils";

test.describe("Rng (xorshift32)", () => {
  test("locks shared deterministic helper outputs", () => {
    expect([
      hashString32(""),
      hashString32("hello"),
      hashString32("123|1|CAM|EMAIL"),
      hashString32("EMAIL|Text Field"),
      hashString32("12345|1|EMAIL|Email Address"),
    ]).toEqual([
      2166136261,
      1335831723,
      2945572075,
      1804514034,
      690413195,
    ]);

    expect(seededRngFromParts(123, 1, "CAM", "EMAIL").nextUint32()).toBe(361900877);
    expect(seededRngFromParts(12345, 1, "EMAIL", "Email Address").nextUint32()).toBe(2886679024);
    expect(seededRngFromParts("EMAIL", "Text Field").nextUint32()).toBe(130363226);

    expect(formatDateYyyymmdd(new Date("2026-02-27T12:34:56Z"))).toBe("20260227");
    expect(formatDateYyyymmdd("2026-02-27")).toBe("20260227");
    expect(truncateValue("X".repeat(300))).toHaveLength(255);
    expect(truncateValue("abcdef", 3)).toBe("abc");
  });

  test("locks the current xorshift32 sequence for representative seeds", () => {
    const rng = new Rng(12345);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual([
      3336926330,
      1697253807,
      2816511904,
    ]);

    const ints = new Rng(42);
    expect([
      ints.int(1, 10),
      ints.int(1, 10),
      ints.int(1, 10),
      ints.int(1, 10),
      ints.int(1, 10),
    ]).toEqual([3, 9, 10, 7, 7]);

    expect(new Rng(999).alpha(8)).toBe("DCKJDCPW");
    expect(new Rng(999).digits(8)).toBe("52695650");
  });

  test("is deterministic for the same seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);

    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());

    expect(seqA).toEqual(seqB);
  });

  test("locks current pure deployer and assessment generation", () => {
    expect(buildDeployerDodIds(new Rng(12345), 3)).toEqual([
      "0742308026",
      "6303189868",
      "7961713301",
    ]);

    expect(
      buildAssessmentSeeds(
        new Rng(42),
        [
          { deployer_id: "dep-1", dod_id: "1111111111" },
          { deployer_id: "dep-2", dod_id: "2222222222" },
        ],
        3,
        { form_type_observed: "OBS", form_version_observed: "VER" },
        [
          Date.parse("2026-02-27T00:00:00Z"),
          Date.parse("2026-02-27T00:00:00Z"),
          Date.parse("2026-02-27T00:00:00Z"),
        ]
      )
    ).toEqual([
      {
        deployer_id: "dep-1",
        event_date: "2025-05-21",
        form_type_observed: "OBS",
        form_version_observed: "VER",
      },
      {
        deployer_id: "dep-2",
        event_date: "2025-11-16",
        form_type_observed: "OBS",
        form_version_observed: "VER",
      },
      {
        deployer_id: "dep-1",
        event_date: "2025-05-19",
        form_type_observed: "OBS",
        form_version_observed: "VER",
      },
    ]);
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
