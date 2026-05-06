import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { applySchemaFromDir } from "./db/db_schema_apply.js";
import { closePool, type DbPool, getPool } from "./db/db_connect.js";
import { createExportFile, loadExportRecordContext } from "./features/export/export_part_01_repository.js";
import { buildFixedWidthLine } from "./features/fixed_width/fixed_width_writer_part_01_place_fields.js";
import { writeLinesToFile } from "./features/fixed_width/fixed_width_writer_part_02_stream_write.js";
import { Rng } from "./features/generator/generator_part_01_rng.js";
import {
  buildAssessmentSeeds,
  buildDeployerDodIds,
  createRun,
  finishRun,
  insertAssessments,
  insertDeployers,
  type AssessmentRow
} from "./features/generator/generator_part_02_insert_assessments.js";
import {
  buildResponseAndProviderReviewSeeds,
  insertGeneratedResponsesAndProviderReviews
} from "./features/generator/generator_part_03_insert_responses.js";
import {
  buildWriterPlan,
  loadExportFields,
  loadParsedRules,
  type WriterFieldPlan
} from "./features/mapping/mapping_compile_part_02_build_writer_plan.js";
import {
  ensureMappingSetForProfile,
  type MappingProfile,
  type MappingProfileBuildResult,
  type MappingSourceCounts
} from "./features/mapping/mapping_seed_part_03_profiles.js";
import { getRunSummary, getValidationErrorCounts } from "./features/report/report_part_01_queries.js";
import { printErrorHistogram } from "./features/report/report_part_02_charts.js";
import { readExportSpecXlsx, type ExportSpecModel } from "./features/spec_import/spec_import_part_01_read_xlsx.js";
import { importSpecToDb } from "./features/spec_import/spec_import_part_02_upsert_catalog.js";
import { persistValidationErrors } from "./features/validate/validate_part_02_persist_errors.js";
import { type ValidationErrorRow, validateRecord } from "./features/validate/validate_part_01_rules_engine.js";

type Options = {
  form?: string;
  gen: number;
  seed: number;
  specName: string;
  specVersion: string;
  mappingProfile: MappingProfile;
  applySchema: boolean;
  out: string;
  help: boolean;
};

export type ExportWorkflowOptions = Omit<Options, "form" | "help"> & {
  form: string;
};

export type ExportWorkflowResult = {
  runSummary: Awaited<ReturnType<typeof getRunSummary>>;
  validationErrorCounts: Awaited<ReturnType<typeof getValidationErrorCounts>>;
  mappingSourceCounts: MappingSourceCounts;
  mappingLiteralFieldCount: number;
  mappingPlaceholderFieldCount: number;
  mappingRuleCount: number;
  outPath: string;
  validationErrorCount: number;
};

type ImportedExportSpec = {
  spec: ExportSpecModel;
  exportSpecId: string;
};

type PreparedMappingProfile = {
  mappingBuild: MappingProfileBuildResult;
  mappingSetId: string;
};

type SeededSyntheticRunData = {
  runId: string;
  assessments: AssessmentRow[];
};

type CompiledExportWriterPlan = {
  plan: WriterFieldPlan[];
};

type WrittenExportFile = {
  exportFileId: string;
  validationErrors: ValidationErrorRow[];
};

function usage(exitCode = 0): never {
  const msg = `
Usage:
  npx tsx main_export.ts -form <ExportFixedWidthForDD2975.xlsx> -gen <N> [--seed 123] [--mapping-profile spec|prealpha] [--apply-schema] [--out ./out/dd2975.txt]

Required env:
  EXPORT_DB_SERVER, EXPORT_DB_PORT, EXPORT_DB_DATABASE, EXPORT_DB_USER, EXPORT_DB_PASSWORD
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
    else if (a === "-form" || a === "--form") opts.form = String(argv[++i] ?? "");
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

export async function runExportWorkflow(pool: DbPool, opts: ExportWorkflowOptions): Promise<ExportWorkflowResult> {
  await prepareSchemaIfRequested(pool, opts);

  const imported = await importExportSpec(pool, opts);
  const mapping = await prepareMappingProfile(pool, imported.exportSpecId, opts.mappingProfile);
  const seeded = await seedSyntheticRunData(pool, opts, mapping.mappingBuild);
  const writer = await compileExportWriterPlan(pool, imported.exportSpecId, mapping.mappingSetId);
  const written = await writeAndValidateExportFile(pool, opts, imported, mapping, seeded, writer);
  await persistValidationAndFinalizeRun(pool, seeded.runId, written);

  return loadExportRunReport(pool, opts, mapping.mappingBuild, seeded.runId, written);
}

async function prepareSchemaIfRequested(pool: DbPool, opts: ExportWorkflowOptions): Promise<void> {
  if (opts.applySchema) {
    await applySchemaFromDir(pool, path.join(process.cwd(), "sql"));
  }
}

async function importExportSpec(pool: DbPool, opts: ExportWorkflowOptions): Promise<ImportedExportSpec> {
  const spec = readExportSpecXlsx(opts.form, opts.specName, opts.specVersion);
  const exportSpecId = await importSpecToDb(pool, spec);

  return { spec, exportSpecId };
}

async function prepareMappingProfile(
  pool: DbPool,
  exportSpecId: string,
  mappingProfile: MappingProfile
): Promise<PreparedMappingProfile> {
  const mappingBuild = await ensureMappingSetForProfile(pool, exportSpecId, mappingProfile);

  return {
    mappingBuild,
    mappingSetId: mappingBuild.mapping_set_id
  };
}

async function seedSyntheticRunData(
  pool: DbPool,
  opts: ExportWorkflowOptions,
  mappingBuild: MappingProfileBuildResult
): Promise<SeededSyntheticRunData> {
  const rng = new Rng(opts.seed);
  const runId = await createRun(pool, `${opts.mappingProfile}_ts`, opts.seed, opts.gen);
  const deployers = await insertDeployers(pool, buildDeployerDodIds(rng, 10));
  const assessmentSeeds = buildAssessmentSeeds(rng, deployers, opts.gen, {
    form_type_observed: mappingBuild.form_type_observed,
    form_version_observed: mappingBuild.form_version_observed
  });
  const assessments = await insertAssessments(pool, runId, assessmentSeeds);

  await insertGeneratedResponsesAndProviderReviews(
    pool,
    buildResponseAndProviderReviewSeeds(rng, assessments, {
      profile: opts.mappingProfile,
      seed: opts.seed,
      spec_response_fields: mappingBuild.spec_response_fields
    })
  );

  return { runId, assessments };
}

async function compileExportWriterPlan(
  pool: DbPool,
  exportSpecId: string,
  mappingSetId: string
): Promise<CompiledExportWriterPlan> {
  const exportFields = await loadExportFields(pool, exportSpecId);
  const rules = await loadParsedRules(pool, mappingSetId);
  const plan = buildWriterPlan(exportFields, rules);

  return { plan };
}

async function writeAndValidateExportFile(
  pool: DbPool,
  opts: ExportWorkflowOptions,
  imported: ImportedExportSpec,
  mapping: PreparedMappingProfile,
  seeded: SeededSyntheticRunData,
  writer: CompiledExportWriterPlan
): Promise<WrittenExportFile> {
  const exportFileId = await createExportFile(pool, {
    runId: seeded.runId,
    mappingSetId: mapping.mappingSetId,
    filePath: opts.out,
    recordCount: opts.gen
  });

  const validationErrors: ValidationErrorRow[] = [];

  async function* lineGen() {
    for (let i = 0; i < seeded.assessments.length; i++) {
      const a = seeded.assessments[i];
      if (!a) throw new Error("Missing seeded assessment row");
      const ordinal = i + 1;
      const ctx = await loadExportRecordContext(pool, a.assessment_id);

      const { line, fieldValues } = buildFixedWidthLine(imported.spec.row_length, writer.plan, ctx);
      const errs = validateRecord(ordinal, writer.plan, fieldValues);
      validationErrors.push(...errs);

      yield line;
    }
  }

  await writeLinesToFile(opts.out, lineGen());

  return { exportFileId, validationErrors };
}

async function persistValidationAndFinalizeRun(
  pool: DbPool,
  runId: string,
  written: WrittenExportFile
): Promise<void> {
  await persistValidationErrors(pool, written.exportFileId, written.validationErrors);
  await finishRun(pool, runId, written.validationErrors.length ? "finished_with_errors" : "finished");
}

async function loadExportRunReport(
  pool: DbPool,
  opts: ExportWorkflowOptions,
  mappingBuild: MappingProfileBuildResult,
  runId: string,
  written: WrittenExportFile
): Promise<ExportWorkflowResult> {
  return {
    runSummary: await getRunSummary(pool, runId),
    validationErrorCounts: await getValidationErrorCounts(pool, written.exportFileId),
    mappingSourceCounts: mappingBuild.source_counts,
    mappingLiteralFieldCount: mappingBuild.literal_field_count,
    mappingPlaceholderFieldCount: mappingBuild.placeholder_field_count,
    mappingRuleCount: mappingBuild.rule_count,
    outPath: opts.out,
    validationErrorCount: written.validationErrors.length
  };
}

function printExportWorkflowResult(result: ExportWorkflowResult) {
  console.log("Run:", result.runSummary);
  printErrorHistogram(result.validationErrorCounts as any);
  console.log("Mapping source counts:", result.mappingSourceCounts);
  console.log(`Mapping literal fields: ${result.mappingLiteralFieldCount}`);
  console.log(`Mapping placeholder fields: ${result.mappingPlaceholderFieldCount}`);
  console.log(`Mapping rules: ${result.mappingRuleCount}`);
  console.log(`Wrote: ${result.outPath}`);
  console.log(`Validation errors: ${result.validationErrorCount}`);
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

  const pool = await getPool("export");

  try {
    printExportWorkflowResult(await runExportWorkflow(pool, { ...opts, form: opts.form }));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await closePool("export");
  }
}

main();
