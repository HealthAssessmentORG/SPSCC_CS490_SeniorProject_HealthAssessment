import { test, expect } from "@playwright/test";

import {
  Alpha1FieldRow,
  buildAlpha1PreviewBatch
} from "../../features/alpha1/alpha1_part_01_workflow";

const emailField: Alpha1FieldRow = { field_id: 1, field_code: "EMAIL", field_name: "Deployer Email" };
const dobField: Alpha1FieldRow = { field_id: 2, field_code: "DOB", field_name: "Date of Birth" };
const middleInitialField: Alpha1FieldRow = {
  field_id: 3,
  field_code: "D_00_02",
  field_name: "Deployer Middle Initial"
};
const todaysDateField: Alpha1FieldRow = {
  field_id: 4,
  field_code: "D_00_05",
  field_name: "Deployer Today's Date"
};
const deploymentDateField: Alpha1FieldRow = {
  field_id: 5,
  field_code: "D_03_00",
  field_name: "Estimated Date of Upcoming Deployment"
};
const completedDateField: Alpha1FieldRow = {
  field_id: 6,
  field_code: "A_30_02",
  field_name: "Date Completed"
};
const longQuestionField: Alpha1FieldRow = {
  field_id: 7,
  field_code: "A_17_00",
  field_name: "Ask Over the PAST MONTH, have you wished you were dead or wished you could go to sleep and not wake up?"
};

function responseFor(field: Alpha1FieldRow, seed: number, assessmentIndex: number): string {
  return buildAlpha1PreviewBatch([field], assessmentIndex, seed)[assessmentIndex - 1].fields[0].response;
}

test.describe("alpha1 generator", () => {
  test("locks representative exact responses for fixed seed and assessment", () => {
    expect(responseFor(emailField, 12345, 1)).toBe("user461796@example.mil");
    expect(responseFor(dobField, 12345, 1)).toBe("19780612");
    expect(responseFor(middleInitialField, 12345, 1)).toBe("T");
    expect(responseFor(todaysDateField, 12345, 1)).toBe("20240602");
    expect(responseFor(longQuestionField, 12345, 1)).toBe("A170ND");
  });

  test("generates deterministic values from seed and field metadata", () => {
    const first = responseFor(emailField, 12345, 1);
    const second = responseFor(emailField, 12345, 1);
    const differentAssessment = responseFor(emailField, 12345, 2);

    expect(first).toBe(second);
    expect(first).not.toBe(differentAssessment);
  });

  test("recognizes email, DOB, and middle initial fields", () => {
    const email = responseFor(emailField, 12345, 1);
    const dob = responseFor(dobField, 12345, 1);
    const middleInitial = responseFor(middleInitialField, 12345, 1);

    expect(email).toMatch(/^user\d{6}@example\.mil$/);
    expect(dob).toMatch(/^\d{8}$/);
    expect(middleInitial).toMatch(/^[A-Z]$/);
  });

  test("treats representative date fields as dates", () => {
    const todaysDate = responseFor(todaysDateField, 12345, 1);
    const deploymentDate = responseFor(deploymentDateField, 12345, 1);
    const completedDate = responseFor(completedDateField, 12345, 1);

    expect(todaysDate).toMatch(/^\d{8}$/);
    expect(deploymentDate).toMatch(/^\d{8}$/);
    expect(completedDate).toMatch(/^\d{8}$/);
  });

  test("uses deterministic fallback text for unknown long question fields", () => {
    const value = responseFor(longQuestionField, 99, 1);
    expect(value).toMatch(/^[A-Z0-9]+$/);
    expect(value.length).toBeGreaterThan(1);
  });

  test("rejects empty field batches", () => {
    expect(() => buildAlpha1PreviewBatch([], 1, 123)).toThrow("FIELD table is empty");
  });

  test("builds preview batches with generated response payloads", () => {
    const preview = buildAlpha1PreviewBatch([emailField, longQuestionField], 2, 123);

    expect(preview).toHaveLength(2);
    expect(preview[0]).toMatchObject({ assessment_index: 1 });
    expect(preview[0].fields).toHaveLength(2);
    expect(preview[0].fields[0]).toHaveProperty("response");
  });

  test("locks preview batch response arrays for fixed seed", () => {
    const fields = [emailField, dobField, middleInitialField, todaysDateField, longQuestionField];
    const preview = buildAlpha1PreviewBatch(fields, 2, 123);

    expect(preview.map((assessment) => assessment.assessment_index)).toEqual([1, 2]);
    expect(preview.map((assessment) => assessment.fields.map((field) => field.response))).toEqual([
      ["user718096@example.mil", "19871127", "L", "20240717", "A170SU"],
      ["user362544@example.mil", "19750723", "S", "20241027", "A1705H"],
    ]);
  });
});
