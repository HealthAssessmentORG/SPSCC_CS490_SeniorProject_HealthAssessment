import type { DbPool } from "../db_connect";
import { buildFixedWidthLine } from "../fixed_width/place_fields";
import { writeLinesToFile } from "../fixed_width/stream_write";
import { buildParsedRuleMap, buildWriterPlan } from "../mapping/build_writer_plan";
import { createExportFile } from "../repositories/export_file_repository";
import { loadExportRecordContext } from "../repositories/export_repository";
import {
  loadExportFields,
  loadExportSpecLayout,
  loadRawMappingRules
} from "../repositories/mapping_repository";
import { loadAssessmentIdsForRun, updateRunStatus } from "../repositories/run_repository";
import { persistValidationErrors } from "../repositories/validation_repository";
import { validateRecord, type Application2ValidationErrorRow } from "../validate/rules_engine";
import type { Application2ExportOptions, Application2ExportResult } from "../types";

export async function runApplication2ExportWorkflow(
  pool: DbPool,
  options: Application2ExportOptions
): Promise<Application2ExportResult> {
  const assessmentIds = await loadAssessmentIdsForRun(pool, options.runId);
  const specLayout = await loadExportSpecLayout(pool, options.exportSpecId);
  const fields = await loadExportFields(pool, options.exportSpecId);
  const rules = buildParsedRuleMap(await loadRawMappingRules(pool, options.mappingSetId));
  const plan = buildWriterPlan(fields, rules);

  const exportFileId = await createExportFile(pool, {
    runId: options.runId,
    mappingSetId: options.mappingSetId,
    filePath: options.out,
    recordCount: assessmentIds.length
  });

  const validationErrors: Application2ValidationErrorRow[] = [];

  async function* lineGen() {
    for (let i = 0; i < assessmentIds.length; i++) {
      const assessmentId = assessmentIds[i]!;
      const recordOrdinal = i + 1;
      const ctx = await loadExportRecordContext(pool, assessmentId);

      const { line, fieldValues } = buildFixedWidthLine(specLayout.row_length, plan, ctx);
      validationErrors.push(...validateRecord(recordOrdinal, plan, fieldValues));

      yield line;
    }
  }

  await writeLinesToFile(options.out, lineGen());
  await persistValidationErrors(pool, exportFileId, validationErrors);
  await updateRunStatus(pool, options.runId, validationErrors.length ? "finished_with_errors" : "finished");

  return {
    ok: true,
    run_id: options.runId,
    export_file_id: exportFileId,
    record_count: assessmentIds.length,
    out_path: options.out,
    validation_error_count: validationErrors.length
  };
}
