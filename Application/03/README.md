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

Set `APP3_LAYOUT_PATH` before launching the UI to validate the selected file. `APP3_MAX_DISPLAY_LINES` controls the bounded preview size and defaults to 20.

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
