import "dotenv/config";

import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

import { getPool, closePool, execSql, sql } from "./db/db_connect";
import { applySchemaFromDir } from "./db/db_schema_apply";

import { readExportSpecXlsx } from "./features/spec_import/spec_import_part_01_read_xlsx";
import { importSpecToDb } from "./features/spec_import/spec_import_part_02_upsert_catalog";

import { Rng } from "./features/generator/generator_part_01_rng";
import { createRun, createDeployers, createAssessments, finishRun } from "./features/generator/generator_part_02_insert_assessments";
import { insertResponsesAndProviderReviews } from "./features/generator/generator_part_03_insert_responses";

import { loadExportFields, loadParsedRules, buildWriterPlan, RecordContext } from "./features/mapping/mapping_compile_part_02_build_writer_plan";
import { buildFixedWidthLine } from "./features/fixed_width/fixed_width_writer_part_01_place_fields";
import { writeLinesToFile } from "./features/fixed_width/fixed_width_writer_part_02_stream_write";
import { validateRecord } from "./features/validate/validate_part_01_rules_engine";
import { persistValidationErrors } from "./features/validate/validate_part_02_persist_errors";
import { getRunSummary, getValidationErrorCounts } from "./features/report/report_part_01_queries";
import { printErrorHistogram } from "./features/report/report_part_02_charts";

type Options = {
  form?: string;        // path to XLSX
  gen: number;          // record count
  seed: number;         // rng seed
  specName: string;
  specVersion: string;
  applySchema: boolean;
  out: string;          // output fixed width file
  help: boolean;
};

function usage(exitCode = 0): never {
  console.log(`
Usage:
  npx tsx main.ts -form <ExportFixedWidthForDD2975.xlsx> -gen <N> [--seed 123] [--apply-schema] [--out ./out/dd2975.txt]

Required env:
  DB_SERVER, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD
`.trim());
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    gen: 0,
    seed: 12345,
    specName: "DD2975_like",
    specVersion: "xlsx_import",
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
    else if (a === "--apply-schema") opts.applySchema = true;
    else if (a === "--out") opts.out = String(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }

  return opts;
}

async function ensureMappingSetForPreAlpha(pool: any, exportSpecId: string): Promise<string> {
  // Creates mapping set + rules for the 20-field slice you described.
  // If it already exists (version 1), reuse it.
  const existing = await execSql(pool, `
    SELECT TOP (1) mapping_set_id
    FROM dbo.MAPPING_SET
    WHERE export_spec_id = @sid AND mapping_version = 1 AND form_version_observed = @fv
  `, {
    sid: { type: sql.UniqueIdentifier, value: exportSpecId },
    fv: { type: sql.NVarChar(50), value: "DD2795_202006" }
  });

  if (existing.recordset.length) return String(existing.recordset[0].mapping_set_id);

  const mappingSetId = randomUUID();
  await execSql(pool, `
    INSERT INTO dbo.MAPPING_SET (mapping_set_id, export_spec_id, form_version_observed, mapping_name, mapping_version)
    VALUES (@id, @sid, @fv, @name, 1)
  `, {
    id: { type: sql.UniqueIdentifier, value: mappingSetId },
    sid: { type: sql.UniqueIdentifier, value: exportSpecId },
    fv: { type: sql.NVarChar(50), value: "DD2795_202006" },
    name: { type: sql.NVarChar(200), value: "prealpha_20" }
  });

  // Insert rules for the fields we care about if present in the spec.
  // We key by field_name so it works whether you imported 20 fields or all 237.
  const wanted: Record<string, { src: string; xform: string; pad: string }> = {
    FORM_TYPE:       { src: "COL:ASSESSMENT.form_type_observed",    xform: "trim",           pad: "pad:right:space" },
    FORM_VERSION:    { src: "COL:ASSESSMENT.form_version_observed", xform: "trim",           pad: "pad:right:space" },
    DODID:           { src: "COL:DEPLOYER.dod_id",                  xform: "trim",           pad: "pad:right:space" },
    D_EVENT:         { src: "COL:ASSESSMENT.event_date",            xform: "date:yyyymmdd",   pad: "pad:right:space" },
    LNAME:           { src: "RESP:DEM:LNAME",                       xform: "trim",           pad: "pad:right:space" },
    FNAME:           { src: "RESP:DEM:FNAME",                       xform: "trim",           pad: "pad:right:space" },
    MI:              { src: "RESP:DEM:MI",                          xform: "trim",           pad: "pad:right:space" },
    DOB:             { src: "RESP:DEM:DOB",                         xform: "trim",           pad: "pad:right:space" },
    SEX:             { src: "RESP:DEM:SEX",                         xform: "trim",           pad: "pad:right:space" },
    FORM_SERVICE:    { src: "RESP:DEM:FORM_SERVICE",                xform: "trim",           pad: "pad:right:space" },
    FORM_COMPONENT:  { src: "RESP:DEM:FORM_COMPONENT",              xform: "trim",           pad: "pad:right:space" },
    GRADE:           { src: "RESP:DEM:GRADE",                       xform: "trim",           pad: "pad:right:space" },
    UNIT_NAME:       { src: "RESP:DEM:UNIT_NAME",                   xform: "trim",           pad: "pad:right:space" },
    UNIT_LOC:        { src: "RESP:DEM:UNIT_LOC",                    xform: "trim",           pad: "pad:right:space" },
    EMAIL:           { src: "RESP:DEM:EMAIL",                       xform: "trim|lower",     pad: "pad:right:space" },

    TRICARE:         { src: "RESP:HP16:TRICARE",                    xform: "trim",           pad: "pad:right:space" },
    PROVIDER_NAME:   { src: "COL:PROVIDER_REVIEW.provider_name",    xform: "trim",           pad: "pad:right:space" },
    CERTIFY_DATE:    { src: "COL:PROVIDER_REVIEW.certify_date",     xform: "date:yyyymmdd",   pad: "pad:right:space" },
    PROVIDER_TITLE:  { src: "COL:PROVIDER_REVIEW.provider_title",   xform: "trim",           pad: "pad:right:space" },
    CERT_PROVIDER:   { src: "COL:PROVIDER_REVIEW.provider_signature", xform: "trim",         pad: "pad:right:space" }
  };

  const fields = await execSql(pool, `
    SELECT export_field_id, field_name
    FROM dbo.EXPORT_FIELD
    WHERE export_spec_id = @sid
  `, { sid: { type: sql.UniqueIdentifier, value: exportSpecId } });

  for (const r of fields.recordset as any[]) {
    const fname = String(r.field_name);
    const w = wanted[fname];
    if (!w) continue;

    await execSql(pool, `
      INSERT INTO dbo.MAPPING_RULE (
        mapping_rule_id, mapping_set_id, export_field_id,
        source_expression, transform_pipeline, default_value, pad_rule
      )
      VALUES (@id, @mid, @fid, @src, @xf, N'', @pad)
    `, {
      id: { type: sql.UniqueIdentifier, value: randomUUID() },
      mid: { type: sql.UniqueIdentifier, value: mappingSetId },
      fid: { type: sql.UniqueIdentifier, value: String(r.export_field_id) },
      src: { type: sql.NVarChar(1000), value: w.src },
      xf: { type: sql.NVarChar(1000), value: w.xform },
      pad: { type: sql.NVarChar(200), value: w.pad }
    });
  }

  return mappingSetId;
}

async function main() {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    usage(1);
  }
  if (opts.help) usage(0);
  if (!opts.form) { console.error("Required: -form <xlsx>"); usage(1); }
  if (!Number.isInteger(opts.gen) || opts.gen <= 0) { console.error("Required: -gen <positive integer>"); usage(1); }
  if (!fs.existsSync(opts.form)) { console.error(`File not found: ${opts.form}`); process.exit(1); }

  const pool = await getPool();

  try {
    if (opts.applySchema) {
      await applySchemaFromDir(pool, path.join(process.cwd(), "sql"));
    }

    // 1) Import spec from XLSX
    const spec = readExportSpecXlsx(opts.form, opts.specName, opts.specVersion);
    const exportSpecId = await importSpecToDb(pool, spec);

    // 2) Create mapping set for pre-alpha 20 fields
    const mappingSetId = await ensureMappingSetForPreAlpha(pool, exportSpecId);

    // 3) Generate DB data (RUN + 100 rows)
    const rng = new Rng(opts.seed);
    const runId = await createRun(pool, "prealpha_ts", opts.seed, opts.gen);
    const deployers = await createDeployers(pool, rng, 10);
    const assessments = await createAssessments(pool, runId, rng, deployers, opts.gen);
    await insertResponsesAndProviderReviews(pool, rng, assessments);

    // 4) Compile plan (fields + rules)
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

        const aRow = (await execSql(pool, `SELECT * FROM dbo.ASSESSMENT WHERE assessment_id=@id`, {
          id: { type: sql.UniqueIdentifier, value: a.assessment_id }
        })).recordset[0];

        const dRow = (await execSql(pool, `
          SELECT d.* FROM dbo.DEPLOYER d
          JOIN dbo.ASSESSMENT a ON a.deployer_id = d.deployer_id
          WHERE a.assessment_id = @id
        `, { id: { type: sql.UniqueIdentifier, value: a.assessment_id } })).recordset[0];

        const prRow = (await execSql(pool, `SELECT * FROM dbo.PROVIDER_REVIEW WHERE assessment_id=@id`, {
          id: { type: sql.UniqueIdentifier, value: a.assessment_id }
        })).recordset[0];

        const respRows = await execSql(pool, `
          SELECT question_code, field_name, value_norm
          FROM dbo.RESPONSE
          WHERE assessment_id = @id
        `, { id: { type: sql.UniqueIdentifier, value: a.assessment_id } });

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
