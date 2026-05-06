import { test, expect } from "@playwright/test";

import { runCli } from "../_helpers/runCli.js";

const shouldRun = process.env["RUN_ALPHA1_DB_E2E"] === "1";

test.describe("alpha1 live DB verification", () => {
  test.skip(!shouldRun, "Set RUN_ALPHA1_DB_E2E=1 to enable (requires DB_* alpha1 env vars).");
  test.describe.configure({ mode: "serial" });

  test("check-db and fields succeed against the alpha1 database", async () => {
    const check = await runCli(["check-db", "--json"], { cwd: process.cwd() });
    expect(check.code).toBe(0);

    const checkPayload = JSON.parse(check.stdout) as {
      ok: boolean;
      database: string;
      tables: Record<string, boolean>;
      field_count: number;
    };

    expect(checkPayload.ok).toBe(true);
    expect(checkPayload.database).toBe("DD2975_PreDHA");
    expect(checkPayload.tables).toEqual({
      ASSESSMENT: true,
      FIELD: true,
      RESPONSE: true
    });
    expect(checkPayload.field_count).toBeGreaterThan(0);

    const fields = await runCli(["fields", "--json"], { cwd: process.cwd() });
    expect(fields.code).toBe(0);

    const fieldPayload = JSON.parse(fields.stdout) as Array<{ field_id: number; field_code: string; field_name: string }>;
    expect(fieldPayload.length).toBeGreaterThan(0);
  });

  test("dry-run preview produces sane representative values", async () => {
    const dryRun = await runCli(["generate", "-gen", "1", "--seed", "123", "--dry-run", "--json"], {
      cwd: process.cwd()
    });
    expect(dryRun.code).toBe(0);

    const payload = JSON.parse(dryRun.stdout) as Array<{
      assessment_index: number;
      fields: Array<{ field_name: string; response: string }>;
    }>;

    expect(payload).toHaveLength(1);

    const firstAssessment = payload[0]!;
    const byName = (fieldName: string) => firstAssessment.fields.find((field) => field.field_name === fieldName)?.response;
    const lastName = byName("Deployer Last Name");
    const email = byName("Deployer Email");
    const todaysDate = byName("Deployer Today's Date");
    const deploymentDate = byName("Estimated Date of Upcoming Deployment");
    const completedDate = byName("Date Completed");

    expect(lastName).toBeDefined();
    expect(email).toBeDefined();
    expect(todaysDate).toBeDefined();
    expect(deploymentDate).toBeDefined();
    expect(completedDate).toBeDefined();
    expect(lastName!).toMatch(/^LAST\d{6}$/);
    expect(email!).toMatch(/^user\d{6}@example\.mil$/);
    expect(todaysDate!).toMatch(/^\d{8}$/);
    expect(deploymentDate!).toMatch(/^\d{8}$/);
    expect(completedDate!).toMatch(/^\d{8}$/);
  });
});
