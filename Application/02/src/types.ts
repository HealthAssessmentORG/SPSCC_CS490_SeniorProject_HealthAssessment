export type Application2ExportOptions = {
  runId: string;
  exportSpecId: string;
  mappingSetId: string;
  out: string;
  json: boolean;
};

export type Application2ExportResult = {
  ok: true;
  run_id: string;
  export_file_id: string;
  record_count: number;
  out_path: string;
  validation_error_count: number;
};

export type Application2DatabaseStatus = {
  database: string;
  tables: Record<string, boolean>;
};

export type Application2DatabaseSummaryCounts = {
  runs: number;
  deployers: number;
  assessments: number;
  responses: number;
  provider_reviews: number;
  export_specs: number;
  export_fields: number;
  mapping_sets: number;
  mapping_rules: number;
  export_files: number;
  validation_errors: number;
};

export type Application2DatabaseSummaryRun = {
  run_id: string;
  run_name: string | null;
  seed: number | null;
  target_record_count: number;
  started_at: string | null;
  finished_at: string | null;
  status: string;
};

export type Application2DatabaseSummaryExportFile = {
  export_file_id: string;
  run_id: string;
  file_path: string;
  record_count: number;
  created_at: string | null;
};

export type Application2DatabaseSummary = {
  database: string;
  counts: Application2DatabaseSummaryCounts;
  latest_run: Application2DatabaseSummaryRun | null;
  latest_export_file: Application2DatabaseSummaryExportFile | null;
};

export type Application2ExportSpecLayout = {
  export_spec_id: string;
  row_length: number;
};

export type Application2RecordContext = {
  assessment: Record<string, unknown> | null;
  deployer: Record<string, unknown> | null;
  provider_review: Record<string, unknown> | null;
  responses: Map<string, string>;
};

export type Application2ExportFieldRow = {
  export_field_id: string;
  field_name: string;
  start_pos: number;
  end_pos: number;
  field_length: number;
  domain_type: string | null;
};

export type Application2RawMappingRuleRow = {
  export_field_id: string;
  source_expression: string;
  transform_pipeline: string | null;
  default_value: string | null;
  pad_rule: string | null;
};

export type Application2RunSummary = {
  run_id: string;
  run_name: string | null;
  seed: number | null;
  target_record_count: number;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  status: string;
};

export type Application2ValidationErrorCount = {
  error_code: string;
  cnt: number;
};

export type Application2ExportFileInsert = {
  runId: string;
  mappingSetId: string;
  filePath: string;
  recordCount: number;
};
