import { test, expect } from "@playwright/test";

import {
  Alpha1FieldRow,
  buildAlpha1PreviewBatch,
  generateAlpha1Response,
  truncateResponse
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

test.describe("alpha1 generator", () => {
  test("generates deterministic values from seed and field metadata", () => {
    const first = generateAlpha1Response(emailField, 12345, 1);
    const second = generateAlpha1Response(emailField, 12345, 1);
    const differentAssessment = generateAlpha1Response(emailField, 12345, 2);

    expect(first).toBe(second);
    expect(first).not.toBe(differentAssessment);
  });

  test("recognizes email, DOB, and middle initial fields", () => {
    const email = generateAlpha1Response(emailField, 12345, 1);
    const dob = generateAlpha1Response(dobField, 12345, 1);
    const middleInitial = generateAlpha1Response(middleInitialField, 12345, 1);

    expect(email).toMatch(/^user\d{6}@example\.mil$/);
    expect(dob).toMatch(/^\d{8}$/);
    expect(middleInitial).toMatch(/^[A-Z]$/);
  });

  test("treats representative date fields as dates", () => {
    const todaysDate = generateAlpha1Response(todaysDateField, 12345, 1);
    const deploymentDate = generateAlpha1Response(deploymentDateField, 12345, 1);
    const completedDate = generateAlpha1Response(completedDateField, 12345, 1);

    expect(todaysDate).toMatch(/^\d{8}$/);
    expect(deploymentDate).toMatch(/^\d{8}$/);
    expect(completedDate).toMatch(/^\d{8}$/);
  });

  test("uses deterministic fallback text for unknown long question fields", () => {
    const value = generateAlpha1Response(longQuestionField, 99, 1);
    expect(value).toMatch(/^[A-Z0-9]+$/);
    expect(value.length).toBeGreaterThan(1);
  });

  test("truncates generated values and rejects empty field batches", () => {
    expect(truncateResponse("X".repeat(300))).toHaveLength(255);
    expect(() => buildAlpha1PreviewBatch([], 1, 123)).toThrow("FIELD table is empty");
  });

  test("builds preview batches with generated response payloads", () => {
    const preview = buildAlpha1PreviewBatch([emailField, longQuestionField], 2, 123);

    expect(preview).toHaveLength(2);
    expect(preview[0]).toMatchObject({ assessment_index: 1 });
    expect(preview[0].fields).toHaveLength(2);
    expect(preview[0].fields[0]).toHaveProperty("response");
  });
});
