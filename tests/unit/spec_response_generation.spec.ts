import { expect, test } from "@playwright/test";
import { Rng } from "../../features/generator/generator_part_01_rng.js";
import {
  buildResponseAndProviderReviewSeeds,
  buildSpecResponses,
  generateSpecResponseValue,
  SpecResponseSeedField,
} from "../../features/generator/generator_part_03_insert_responses.js";

function mkField(p: Partial<SpecResponseSeedField> & { field_name: string; question_code: string }): SpecResponseSeedField {
  return {
    field_name: p.field_name,
    question_code: p.question_code,
    field_length: p.field_length ?? 10,
    domain_type: p.domain_type ?? null,
    values_spec_raw: p.values_spec_raw ?? null,
  };
}

test.describe("spec response deterministic generation", () => {
  test("locks representative exact generated values for fixed seed and ordinal", () => {
    const fields = [
      mkField({
        question_code: "CAM",
        field_name: "LNAME",
        field_length: 25,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      }),
      mkField({
        question_code: "CAM",
        field_name: "FNAME",
        field_length: 20,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      }),
      mkField({
        question_code: "CAM",
        field_name: "MI",
        field_length: 1,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      }),
      mkField({
        question_code: "CAM",
        field_name: "EMAIL",
        field_length: 50,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      }),
      mkField({
        question_code: "CAM",
        field_name: "OK",
        field_length: 1,
        values_spec_raw: "Y=Yes, N=No, U=Don't know",
      }),
      mkField({
        question_code: "CAM",
        field_name: "DOB",
        field_length: 8,
        values_spec_raw: "YYYYMMDD",
        domain_type: "DATE_YYYYMMDD",
      }),
      mkField({
        question_code: "CAM",
        field_name: "ID",
        field_length: 10,
        values_spec_raw: "9999999999",
        domain_type: "DODID10",
      }),
      mkField({
        question_code: "CAM",
        field_name: "RATING",
        field_length: 1,
        values_spec_raw: "E=Excellent, V=Very Good, G=Good, F=Fair, P=Poor",
      }),
      mkField({
        question_code: "CAM",
        field_name: "MISC_CODE",
        field_length: 6,
      }),
    ];

    expect(
      Object.fromEntries(
        fields.map((field) => [
          field.field_name,
          generateSpecResponseValue(field, "2026-02-27", 123, 1),
        ])
      )
    ).toEqual({
      LNAME: "LAST280399",
      FNAME: "FIRST244093",
      MI: "Z",
      EMAIL: "user728509@example.mil",
      OK: "N",
      DOB: "19971205",
      ID: "8956650676",
      RATING: "P",
      MISC_CODE: "MISCPE",
    });
  });

  test("same seed+record+field yields same value", () => {
    const f = mkField({
      question_code: "CAM",
      field_name: "ID",
      field_length: 10,
      values_spec_raw: "9999999999",
      domain_type: "DODID10",
    });

    const a = generateSpecResponseValue(f, "2026-02-27", 123, 1);
    const b = generateSpecResponseValue(f, "2026-02-27", 123, 1);
    expect(a).toBe(b);
  });

  test("builds spec response payloads without persistence", () => {
    const assessment = {
      assessment_id: "a1",
      deployer_id: "dep-1",
      event_date: "2026-02-27",
    };
    const fields = [
      mkField({
        question_code: "CAM",
        field_name: "EMAIL",
        field_length: 50,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      }),
      mkField({
        question_code: "CAM",
        field_name: "EMAIL",
        field_length: 50,
        values_spec_raw: "Text Field",
        domain_type: "TEXT",
      }),
      mkField({
        question_code: "",
        field_name: "SKIP",
        field_length: 4,
      }),
      mkField({
        question_code: "CAM",
        field_name: "DOB",
        field_length: 8,
        values_spec_raw: "YYYYMMDD",
        domain_type: "DATE_YYYYMMDD",
      }),
    ];

    expect(buildSpecResponses(assessment, fields, 123, 1)).toEqual([
      {
        question_code: "CAM",
        field_name: "EMAIL",
        value_raw: "user728509@example.mil",
        value_norm: "user728509@example.mil",
      },
      {
        question_code: "CAM",
        field_name: "DOB",
        value_raw: "19971205",
        value_norm: "19971205",
      },
    ]);
  });

  test("builds response and provider-review payloads in existing RNG order", () => {
    const assessment = {
      assessment_id: "a1",
      deployer_id: "dep-1",
      event_date: "2026-02-27",
    };

    const specBundle = buildResponseAndProviderReviewSeeds(new Rng(123), [assessment], {
      profile: "spec",
      seed: 123,
      spec_response_fields: [
        mkField({
          question_code: "CAM",
          field_name: "EMAIL",
          field_length: 50,
          values_spec_raw: "Text Field",
          domain_type: "TEXT",
        }),
      ],
    });
    expect(specBundle[0]!.providerReview).toEqual({
      provider_name: "Dr 688220",
      certify_date: "2026-02-27",
      provider_title: "2",
      provider_signature: "Y",
    });

    const prealphaBundle = buildResponseAndProviderReviewSeeds(new Rng(123), [assessment], {
      profile: "prealpha",
      seed: 123,
    });
    expect(Object.fromEntries(prealphaBundle[0]!.responses.map((r) => [r.field_name, r.value_raw]))).toMatchObject({
      LNAME: "LAST688220",
      FNAME: "FIRST501187",
      MI: "W",
      DOB: "20010704",
      EMAIL: "user880016@example.mil",
      TRICARE: "N",
    });
    expect(prealphaBundle[0]!.providerReview).toEqual({
      provider_name: "Dr 792178",
      certify_date: "2026-02-27",
      provider_title: "6",
      provider_signature: "Y",
    });
  });

  test("different record ordinal changes value", () => {
    const f = mkField({
      question_code: "CAM",
      field_name: "ID",
      field_length: 10,
      values_spec_raw: "9999999999",
      domain_type: "DODID10",
    });

    const a = generateSpecResponseValue(f, "2026-02-27", 123, 1);
    const b = generateSpecResponseValue(f, "2026-02-27", 123, 2);
    expect(a).not.toBe(b);
  });

  test("enum/date/numeric values are valid", () => {
    const enumField = mkField({
      question_code: "CAM",
      field_name: "OK",
      field_length: 1,
      values_spec_raw: "Y=Yes, N=No, U=Don't know",
    });
    const dateField = mkField({
      question_code: "CAM",
      field_name: "DOB",
      field_length: 8,
      values_spec_raw: "YYYYMMDD",
      domain_type: "DATE_YYYYMMDD",
    });
    const numField = mkField({
      question_code: "CAM",
      field_name: "ID",
      field_length: 10,
      values_spec_raw: "9999999999",
      domain_type: "DODID10",
    });

    const ev = generateSpecResponseValue(enumField, "2026-02-27", 123, 1);
    const dv = generateSpecResponseValue(dateField, "2026-02-27", 123, 1);
    const nv = generateSpecResponseValue(numField, "2026-02-27", 123, 1);

    expect(["Y", "N", "U"]).toContain(ev);
    expect(dv).toMatch(/^\d{8}$/);
    expect(nv).toMatch(/^\d{10}$/);
  });
});
