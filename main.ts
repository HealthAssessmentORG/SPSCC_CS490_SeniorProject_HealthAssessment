import "dotenv/config";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { applySchemaFromDir } from "./db/db_schema_apply";
import { closePool, execSql, getPool, sql } from "./db/db_connect";
import { buildFixedWidthLine } from "./features/fixed_width/fixed_width_writer_part_01_place_fields";
import { writeLinesToFile } from "./features/fixed_width/fixed_width_writer_part_02_stream_write";
import { Rng } from "./features/generator/generator_part_01_rng";
import {
  createAssessments,
  createDeployers,
  createRun,
  finishRun
} from "./features/generator/generator_part_02_insert_assessments";
import { insertResponsesAndProviderReviews } from "./features/generator/generator_part_03_insert_responses";
import {
  buildWriterPlan,
  loadExportFields,
  loadParsedRules,
  RecordContext
} from "./features/mapping/mapping_compile_part_02_build_writer_plan";
import { ensureMappingSetForProfile, MappingProfile } from "./features/mapping/mapping_seed_part_03_profiles";
import { getRunSummary, getValidationErrorCounts } from "./features/report/report_part_01_queries";
import { printErrorHistogram } from "./features/report/report_part_02_charts";
import { readExportSpecXlsx } from "./features/spec_import/spec_import_part_01_read_xlsx";
import { importSpecToDb } from "./features/spec_import/spec_import_part_02_upsert_catalog";
import { persistValidationErrors } from "./features/validate/validate_part_02_persist_errors";
import { validateRecord } from "./features/validate/validate_part_01_rules_engine";

type Options = {
  form?: string; // path to XLSX
  gen: number; // record count
  seed: number; // rng seed
  specName: string;
  specVersion: string;
  mappingProfile: MappingProfile;
  applySchema: boolean;
  out: string; // output fixed width file
  help: boolean;
};

function usage(exitCode = 0): never {
  const msg = `
Usage:
  npx tsx main.ts -form <ExportFixedWidthForDD2975.xlsx> -gen <N> [--seed 123] [--mapping-profile spec|prealpha] [--apply-schema] [--out ./out/dd2975.txt]

Required env:
  DB_SERVER, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD
`.trim();
  fs.writeSync(1, msg + "\n");
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    gen: 0,
    seed: 12345,
    specName: "DD2975_like",
    specVersion: "xlsx_import",
    mappingProfile: "spec",
    applySchema: false,
    out: "./out/export.txt",
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-form" || a === "--form") opts.form = argv[++i];
    else if (a === "-gen" || a === "--gen") opts.gen = Number(argv[++i]);
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--spec-name") opts.specName = String(argv[++i]);
    else if (a === "--spec-version") opts.specVersion = String(argv[++i]);
    else if (a === "--mapping-profile") {
      const v = String(argv[++i] ?? "").trim().toLowerCase();
      if (v !== "spec" && v !== "prealpha") {
        throw new Error(`Invalid --mapping-profile: ${v}. Expected: spec|prealpha`);
      }
      opts.mappingProfile = v;
    } else if (a === "--apply-schema") opts.applySchema = true;
    else if (a === "--out") opts.out = String(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }

  return opts;
}

async function main() {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    fs.writeSync(2, `${(e as Error).message}\n`);
    usage(1);
  }

  if (opts.help) usage(0);
  if (!opts.form) {
    fs.writeSync(2, "Required: -form <xlsx>\n");
    usage(1);
  }
  if (!Number.isInteger(opts.gen) || opts.gen <= 0) {
    fs.writeSync(2, "Required: -gen <positive integer>\n");
    usage(1);
  }
  if (!fs.existsSync(opts.form)) {
    fs.writeSync(2, `File not found: ${opts.form}\n`);
    process.exit(1);
  }

  const pool = await getPool();

  try {
    if (opts.applySchema) {
      await applySchemaFromDir(pool, path.join(process.cwd(), "sql"));
    }

    // 1) Import spec from XLSX
    const spec = readExportSpecXlsx(opts.form, opts.specName, opts.specVersion);
    const exportSpecId = await importSpecToDb(pool, spec);

    // 2) Build mapping set for selected profile
    const mappingBuild = await ensureMappingSetForProfile(pool, exportSpecId, opts.mappingProfile);
    const mappingSetId = mappingBuild.mapping_set_id;

    // 3) Generate DB rows
    const rng = new Rng(opts.seed);
    const runId = await createRun(pool, `${opts.mappingProfile}_ts`, opts.seed, opts.gen);
    const deployers = await createDeployers(pool, rng, 10);
    const assessments = await createAssessments(pool, runId, rng, deployers, opts.gen, {
      form_type_observed: mappingBuild.form_type_observed,
      form_version_observed: mappingBuild.form_version_observed
    });
    await insertResponsesAndProviderReviews(pool, rng, assessments, {
      profile: opts.mappingProfile,
      seed: opts.seed,
      spec_response_fields: mappingBuild.spec_response_fields
    });

    // 4) Compile writer plan
    const exportFields = await loadExportFields(pool, exportSpecId);
    const rules = await loadParsedRules(pool, mappingSetId);
    const plan = buildWriterPlan(exportFields, rules);

    // 5) Stream export file, validate, persist metadata/errors
    const export_file_id = randomUUID();
    await execSql(pool, `
      INSERT INTO dbo.EXPORT_FILE (export_file_id, run_id, mapping_set_id, file_path, record_count)
      VALUES (@id, @rid, @mid, @p, @cnt)
    `, {
      id: { type: sql.UniqueIdentifier, value: export_file_id },
      rid: { type: sql.UniqueIdentifier, value: runId },
      mid: { type: sql.UniqueIdentifier, value: mappingSetId },
      p: { type: sql.NVarChar(1024), value: opts.out },
      cnt: { type: sql.Int, value: opts.gen }
    });

    const allErrors: any[] = [];

    async function* lineGen() {
      for (let i = 0; i < assessments.length; i++) {
        const a = assessments[i];
        const ordinal = i + 1;

        const aRow = (
          await execSql(pool, `SELECT * FROM dbo.ASSESSMENT WHERE assessment_id=@id`, {
            id: { type: sql.UniqueIdentifier, value: a.assessment_id }
          })
        ).recordset[0];

        const dRow = (
          await execSql(
            pool,
            `
          SELECT d.* FROM dbo.DEPLOYER d
          JOIN dbo.ASSESSMENT a ON a.deployer_id = d.deployer_id
          WHERE a.assessment_id = @id
        `,
            { id: { type: sql.UniqueIdentifier, value: a.assessment_id } }
          )
        ).recordset[0];

        const prRow = (
          await execSql(pool, `SELECT * FROM dbo.PROVIDER_REVIEW WHERE assessment_id=@id`, {
            id: { type: sql.UniqueIdentifier, value: a.assessment_id }
          })
        ).recordset[0];

        const respRows = await execSql(
          pool,
          `
          SELECT question_code, field_name, value_norm
          FROM dbo.RESPONSE
          WHERE assessment_id = @id
        `,
          { id: { type: sql.UniqueIdentifier, value: a.assessment_id } }
        );

        const respMap = new Map<string, string>();
        for (const r of respRows.recordset as any[]) {
          respMap.set(`${r.question_code}:${r.field_name}`, String(r.value_norm ?? ""));
        }

        const ctx: RecordContext = {
          assessment: aRow,
          deployer: dRow,
          provider_review: prRow,
          responses: respMap
        };

        const { line, fieldValues } = buildFixedWidthLine(spec.row_length, plan, ctx);
        const errs = validateRecord(ordinal, plan, fieldValues);
        allErrors.push(...errs);

        yield line;
      }
    }

    await writeLinesToFile(opts.out, lineGen());
    await persistValidationErrors(pool, export_file_id, allErrors);
    await finishRun(pool, runId, allErrors.length ? "finished_with_errors" : "finished");

    // Report
    const runSummary = await getRunSummary(pool, runId);
    console.log("Run:", runSummary);

    const errCounts = await getValidationErrorCounts(pool, export_file_id);
    printErrorHistogram(errCounts as any);

    console.log("Mapping source counts:", mappingBuild.source_counts);
    console.log(`Mapping literal fields: ${mappingBuild.literal_field_count}`);
    console.log(`Mapping placeholder fields: ${mappingBuild.placeholder_field_count}`);
    console.log(`Mapping rules: ${mappingBuild.rule_count}`);
    console.log(`Wrote: ${opts.out}`);
    console.log(`Validation errors: ${allErrors.length}`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main();
