# Application 3

Application 3 validates fixed-width output produced by Application 2.

## CLI

Run validation with:

```text
node --import tsx Application/03/src/main.ts validate --input <fixed-width-output> --layout <layout.json> [--json] [--report <path>]
```

`--input`, `--layout`, and `--report` can also come from:

```text
APP3_INPUT_PATH
APP3_LAYOUT_PATH
APP3_REPORT_PATH
```

Explicit CLI flags take priority over environment defaults. Human-readable output prints a bounded summary report. JSON mode prints one report object to stdout.

When `--report` is used, Application 3 writes the same report to that path. With `--json`, the report file is JSON; otherwise, it is human-readable text.

## Ink UI

Run the file picker with:

```text
npm run ui:app3
```

The UI first asks for the fixed-width output file, then asks for the layout JSON file. After both files are selected, it validates the output file and displays the selected paths, validation result, records checked, validation error count, deterministic error counts, and a bounded file preview.

`APP3_LAYOUT_PATH` is still supported as an optional preselected layout path. When it is set, the UI skips the layout picker and validates the selected output file with that layout.

`APP3_MAX_DISPLAY_LINES` controls the bounded preview size and defaults to 20.

## Avoiding Invalid JSON

Application 2 writes fixed-width text output, not JSON. This is expected.

Application 3 needs two separate files:

1. The Application 2 fixed-width output file.
2. A layout JSON file that describes the fixed-width fields.

In the App 3 UI:

1. On `Select Application 2 fixed-width output file`, select the `.txt` output from App 2.
2. On `Select Application 3 layout JSON file`, select a `.json` layout file.
3. Do not select the App 2 output file on the layout screen.

If `APP3_LAYOUT_PATH` is set, confirm it points to a layout JSON file, not the App 2 output file. When `APP3_LAYOUT_PATH` points at fixed-width output, the UI skips the layout picker and App 3 reports `invalid JSON`.

CLI usage follows the same rule:

```bash
node --import tsx Application/03/src/main.ts validate \
  --input <app2-fixed-width-output.txt> \
  --layout <layout.json>
```

If App 3 reports `<path>: invalid JSON`, the path shown is being read as the layout file. Go back with `b` in the UI, or unset/fix `APP3_LAYOUT_PATH`, then select the correct layout JSON.

Press `w` after validation completes to write a human-readable report. The UI uses `APP3_REPORT_PATH` when set; otherwise it writes:

```text
out/milestones/demo/app3_ui_report.txt
```

UI report writing is explicit and human-readable only. JSON report output remains a CLI feature.

Useful demo files:

```text
Application/03/demo/valid_output.txt
Application/03/demo/invalid_output.txt
Application/03/demo/layout.json
```

## UI Demo Smoke

Run App 3 UI:

```bash
npm run ui:app3
```

For the passing case, select:

```text
Application/03/demo/valid_output.txt
Application/03/demo/layout.json
```

For the failing case, select:

```text
Application/03/demo/invalid_output.txt
Application/03/demo/layout.json
```

Press `w` on the validation screen to write the UI report, then view it:

```bash
sed -n '1,120p' out/milestones/demo/app3_ui_report.txt
```

## Layout Contract

The output file is not self-describing. Application 3 requires a separate JSON layout file before it can slice fixed-width records into named fields.

`start_pos` is one-based to match the Application 2 fixed-width writer.

```json
{
  "row_length": 18,
  "fields": [
    {
      "field_name": "DODID",
      "start_pos": 1,
      "length": 10,
      "domain_type": "DODID10"
    },
    {
      "field_name": "DATE",
      "start_pos": 11,
      "length": 8,
      "domain_type": "DATE_YYYYMMDD"
    }
  ]
}
```

Layout loading rejects nonpositive row lengths, blank field names, nonpositive positions, nonpositive field lengths, fields that extend beyond `row_length`, and overlapping fields. Unknown `domain_type` values are allowed so later validation can ignore unsupported domains without blocking layout loading.

## Validation Workflow

The validator reads Application 2 output line by line. For each line, it checks `row_length`, slices fields using one-based `start_pos` and `length`, and applies the field validation rules.

Row length failures use:

```text
error_code: ROW_LENGTH_MISMATCH
export_field_name: __ROW__
message: Expected row length N, got M
```

## Summary Report

Reports include the input path, layout path, records checked, total validation errors, counts by error code, and a bounded validation-error sample. The default sample size is 5 errors so large files do not dump every validation error by default.
