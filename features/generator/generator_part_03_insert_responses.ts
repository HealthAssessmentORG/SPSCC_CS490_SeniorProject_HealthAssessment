import { DbPool, execSql, sql } from "../../db/db_connect";
import { Rng } from "./generator_part_01_rng";
import { AssessmentRow } from "./generator_part_02_insert_assessments";

import { randomUUID } from "node:crypto";

type ResponseSeed = {
  question_code: string;
  field_name: string;
  value_raw: string;
  value_norm?: string;
};

function yyyymmdd(dateIso: string): string {
  return dateIso.replaceAll("-", "");
}

export async function insertResponsesAndProviderReviews(
  pool: DbPool,
  rng: Rng,
  assessments: AssessmentRow[]
) {
  const services = ["F", "A", "N", "M", "C", "X", "P", "D"];
  const components = ["A", "N", "R", "X"];
  const grades = ["E04", "E05", "E06", "O02", "W02"];

  for (const a of assessments) {
    const last = `LAST${rng.digits(6)}`;
    const first = `FIRST${rng.digits(6)}`;
    const mi = rng.alpha(1);

    // DOB: 18-42 years back, then shift within 0..3650 days
    const years = rng.int(18, 42);
    const base = new Date(a.event_date + "T00:00:00Z");
    base.setUTCFullYear(base.getUTCFullYear() - years);
    base.setUTCDate(base.getUTCDate() - rng.int(0, 3650));
    const dobIso = base.toISOString().slice(0, 10);

    const sex = rng.pick(["M", "F"]);
    const svc = rng.pick(services);
    const comp = rng.pick(components);
    const grade = rng.pick(grades);

    const unitName = `UNIT_${rng.digits(6)}`;
    const unitLoc = `BASE_${rng.digits(6)}`;
    const emailRaw = `user${rng.digits(6)}@example.mil`;
    const tricare = rng.pick(["Y", "N"]);

    const responses: ResponseSeed[] = [
      { question_code: "DEM", field_name: "LNAME", value_raw: last },
      { question_code: "DEM", field_name: "FNAME", value_raw: first },
      { question_code: "DEM", field_name: "MI", value_raw: mi },
      { question_code: "DEM", field_name: "DOB", value_raw: yyyymmdd(dobIso) },
      { question_code: "DEM", field_name: "SEX", value_raw: sex },
      { question_code: "DEM", field_name: "FORM_SERVICE", value_raw: svc },
      { question_code: "DEM", field_name: "FORM_COMPONENT", value_raw: comp },
      { question_code: "DEM", field_name: "GRADE", value_raw: grade },
      { question_code: "DEM", field_name: "UNIT_NAME", value_raw: unitName },
      { question_code: "DEM", field_name: "UNIT_LOC", value_raw: unitLoc },
      { question_code: "DEM", field_name: "EMAIL", value_raw: emailRaw, value_norm: emailRaw.toLowerCase() },

      // Reviewer checkbox lives in RESPONSE in your plan
      { question_code: "HP16", field_name: "TRICARE", value_raw: tricare }
    ];

    for (const r of responses) {
      await execSql(pool, `
        INSERT INTO dbo.RESPONSE (response_id, assessment_id, question_code, field_name, value_raw, value_norm)
        VALUES (@id, @aid, @q, @f, @raw, @norm)
      `, {
        id: { type: sql.UniqueIdentifier, value: randomUUID() },
        aid: { type: sql.UniqueIdentifier, value: a.assessment_id },
        q: { type: sql.NVarChar(50), value: r.question_code },
        f: { type: sql.NVarChar(100), value: r.field_name },
        raw: { type: sql.NVarChar(4000), value: r.value_raw },
        norm: { type: sql.NVarChar(4000), value: r.value_norm ?? r.value_raw }
      });
    }

    // PROVIDER_REVIEW table (5 reviewer questions target; signature/title/date/name here)
    const provider_name = `Dr ${rng.digits(6)}`;
    const certify_date = a.event_date;
    const provider_title = String(rng.int(1, 8));
    const provider_signature = rng.pick(["Y", "N"]);

    await execSql(pool, `
      INSERT INTO dbo.PROVIDER_REVIEW (assessment_id, provider_name, certify_date, provider_title, provider_signature)
      VALUES (@aid, @pn, @cd, @pt, @ps)
    `, {
      aid: { type: sql.UniqueIdentifier, value: a.assessment_id },
      pn: { type: sql.NVarChar(200), value: provider_name },
      cd: { type: sql.Date, value: certify_date },
      pt: { type: sql.NVarChar(50), value: provider_title },
      ps: { type: sql.NVarChar(200), value: provider_signature }
    });
  }
}
