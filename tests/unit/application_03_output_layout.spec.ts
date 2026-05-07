import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";

import { loadOutputLayout, parseOutputLayoutJson } from "../../Application/03/src/output_layout.js";

const validLayout = {
  row_length: 18,
  fields: [
    {
      field_name: "DODID",
      start_pos: 1,
      length: 10,
      domain_type: "DODID10"
    },
    {
      field_name: "DATE",
      start_pos: 11,
      length: 8,
      domain_type: "DATE_YYYYMMDD"
    }
  ]
};

test.describe("Application 3 output layout", () => {
  test("loads a valid JSON layout file", async ({}, testInfo) => {
    const layoutPath = testInfo.outputPath("layout.json");
    await fs.writeFile(layoutPath, JSON.stringify(validLayout), "utf8");

    await expect(loadOutputLayout(layoutPath)).resolves.toEqual(validLayout);
  });

  test("returns fields sorted by one-based start position", () => {
    const layout = parseOutputLayoutJson(
      JSON.stringify({
        row_length: 18,
        fields: [validLayout.fields[1], validLayout.fields[0]]
      })
    );

    expect(layout.fields.map((field) => field.field_name)).toEqual(["DODID", "DATE"]);
  });

  test("allows null and unknown domain types", () => {
    expect(
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 8,
          fields: [
            { field_name: "A", start_pos: 1, length: 2, domain_type: null },
            { field_name: "B", start_pos: 4, length: 2, domain_type: "UNSUPPORTED" }
          ]
        })
      )
    ).toEqual({
      row_length: 8,
      fields: [
        { field_name: "A", start_pos: 1, length: 2, domain_type: null },
        { field_name: "B", start_pos: 4, length: 2, domain_type: "UNSUPPORTED" }
      ]
    });
  });

  test("rejects malformed JSON", () => {
    expect(() => parseOutputLayoutJson("{ nope", "bad.json")).toThrow("bad.json: invalid JSON");
  });

  test("rejects missing fields array", () => {
    expect(() => parseOutputLayoutJson(JSON.stringify({ row_length: 18 }))).toThrow("fields must be an array");
  });

  test("rejects invalid row length and field numbers", () => {
    expect(() => parseOutputLayoutJson(JSON.stringify({ row_length: 0, fields: [] }))).toThrow(
      "row_length must be a positive integer"
    );
    expect(() =>
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 8,
          fields: [{ field_name: "A", start_pos: 0, length: 2, domain_type: null }]
        })
      )
    ).toThrow("fields[0].start_pos must be a positive integer");
    expect(() =>
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 8,
          fields: [{ field_name: "A", start_pos: 1, length: 0, domain_type: null }]
        })
      )
    ).toThrow("fields[0].length must be a positive integer");
  });

  test("rejects blank field names and invalid domain types", () => {
    expect(() =>
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 8,
          fields: [{ field_name: " ", start_pos: 1, length: 2, domain_type: null }]
        })
      )
    ).toThrow("fields[0].field_name must be a nonblank string");
    expect(() =>
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 8,
          fields: [{ field_name: "A", start_pos: 1, length: 2, domain_type: 42 }]
        })
      )
    ).toThrow("fields[0].domain_type must be a string or null");
  });

  test("rejects fields beyond row length", () => {
    expect(() =>
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 5,
          fields: [{ field_name: "TAIL", start_pos: 4, length: 3, domain_type: null }]
        })
      )
    ).toThrow("TAIL ends at 6, beyond row_length 5");
  });

  test("rejects overlapping fields", () => {
    expect(() =>
      parseOutputLayoutJson(
        JSON.stringify({
          row_length: 10,
          fields: [
            { field_name: "A", start_pos: 1, length: 5, domain_type: null },
            { field_name: "B", start_pos: 5, length: 2, domain_type: null }
          ]
        })
      )
    ).toThrow("B overlaps A");
  });
});
