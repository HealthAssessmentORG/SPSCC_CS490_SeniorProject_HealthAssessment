import type { DbPool } from "../db_connect.js";
import { buildFixedWidthLine } from "../fixed_width/place_fields.js";
import { writeLinesToFile } from "../fixed_width/stream_write.js";
import { buildParsedRuleMap, buildWriterPlan } from "../mapping/build_writer_plan.js";
import { createExportFile } from "../repositories/export_file_repository.js";
import { loadExportRecordContext } from "../repositories/export_repository.js";
import {
  loadExportFields,
  loadExportSpecLayout,
  loadRawMappingRules
} from "../repositories/mapping_repository.js";
import { loadAssessmentIdsForRun, updateRunStatus } from "../repositories/run_repository.js";
import { persistValidationErrors } from "../repositories/validation_repository.js";
import { validateRecord, type Application2ValidationErrorRow } from "../validate/rules_engine.js";
import type {
  Application2ExportOptions,
  Application2ExportProgressHandler,
  Application2ExportResult
} from "../types.js";

type Application2ExportWorkflowHooks = {
  onRecordWritten?: Application2ExportProgressHandler;
};

export async function runApplication2ExportWorkflow(
  pool: DbPool,
  options: Application2ExportOptions,
  hooks: Application2ExportWorkflowHooks = {}
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

  await writeLinesToFile(options.out, lineGen(), {
    onLineWritten: async (writtenCount) => {
      if (!hooks.onRecordWritten) return;
      await hooks.onRecordWritten({
        type: "record_progress",
        current: writtenCount,
        total: assessmentIds.length
      });
    }
  });
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
