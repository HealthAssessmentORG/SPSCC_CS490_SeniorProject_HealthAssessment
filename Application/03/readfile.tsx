import React, { useEffect, useState } from "react";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Box, Text, useApp, useInput } from "ink";

import { loadOutputLayout } from "./src/output_layout.js";
import { APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT } from "./src/report.js";
import { writeApplication3UiHumanReport } from "./src/ui_report_action.js";
import {
  validateApplication2OutputFile,
  type Application3ValidationWorkflowResult
} from "./src/validator_workflow.js";

type Props = {
  path: string;
  layoutPath: string;
  maxDisplayLines: number;
  onBack?: () => void;
};

type Preview = {
  lines: string[];
  truncated: boolean;
};

async function readPreviewLines(path: string, maxLines: number): Promise<Preview> {
  const lines: string[] = [];
  let truncated = false;
  const stream = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  try {
    for await (const line of reader) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      lines.push(line);
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return { lines, truncated };
}

export default function ReadFile({ path, layoutPath, maxDisplayLines, onBack }: Props) {
  const { exit } = useApp();
  const [preview, setPreview] = useState<Preview>({ lines: [], truncated: false });
  const [result, setResult] = useState<Application3ValidationWorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setError(null);
    setReportStatus(null);
    setPreview({ lines: [], truncated: false });

    async function loadFileState() {
      const nextPreview = await readPreviewLines(path, maxDisplayLines);
      const nextResult = await loadOutputLayout(layoutPath).then((layout) =>
        validateApplication2OutputFile({
          inputPath: path,
          layout,
          layoutSource: layoutPath
        })
      );

      if (!cancelled) {
        setPreview(nextPreview);
        setResult(nextResult);
        setLoading(false);
      }
    }

    loadFileState()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [layoutPath, maxDisplayLines, path]);

  useInput((input) => {
    if (input === "q") {
      exit();
      setTimeout(() => process.exit(0), 0);
    }
    if (input === "b" && onBack) onBack();
    if (input === "w" && result) {
      void writeApplication3UiHumanReport(result).then((writeResult) => {
        setReportStatus(writeResult.ok ? `Report written: ${writeResult.path}` : writeResult.message);
      });
    }
  });

  const errorSample = result?.validation_errors.slice(0, APPLICATION3_REPORT_ERROR_SAMPLE_LIMIT) ?? [];

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>File:</Text>
        <Text> {path}</Text>
      </Box>
      <Box>
        <Text bold>Layout:</Text>
        <Text> {layoutPath}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {loading && <Text color="yellow">Loading...</Text>}
        {error && <Text color="red">Error: {error}</Text>}
        {!loading && !error && result && (
          <>
            <Text color={result.validation_error_count === 0 ? "green" : "red"}>
              Validation: {result.validation_error_count === 0 ? "passed" : "failed"}
            </Text>
            <Text>Records checked: {result.records_checked}</Text>
            <Text>Validation errors: {result.validation_error_count}</Text>
            {result.error_counts.map((row) => (
              <Text key={row.error_code}>
                {row.error_code}: {row.count}
              </Text>
            ))}
            <Text bold>Error sample</Text>
            {errorSample.length === 0 ? <Text>Error sample: none</Text> : null}
            {errorSample.map((row) => (
              <Text key={`${row.record_ordinal}:${row.export_field_name}:${row.error_code}:${row.actual ?? ""}`}>
                record {row.record_ordinal} {row.export_field_name} {row.error_code}: expected {row.expected ?? "(none)"}, actual{" "}
                {row.actual ?? "(none)"}; {row.message}
              </Text>
            ))}
            {result.validation_errors.length > errorSample.length ? (
              <Text dimColor>
                Error sample truncated: {result.validation_errors.length - errorSample.length} more errors
              </Text>
            ) : null}
          </>
        )}
        {reportStatus ? <Text>{reportStatus}</Text> : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Preview</Text>
        {preview.lines.length === 0 && !loading && !error && <Text dimColor>No lines to display.</Text>}
        {preview.lines.map((line, index) => (
          <Text key={`${index}:${line}`}>{line}</Text>
        ))}
        {preview.truncated && <Text dimColor>Preview limited to {maxDisplayLines} lines.</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press w to write report, b to go back, q to quit.</Text>
      </Box>
    </Box>
  );
}
