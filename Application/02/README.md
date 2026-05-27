# Application 2

Application 2 pulls existing database records, transforms them into export rows, writes fixed-width output, and exposes small database health APIs.

Current status: independent export flow, database status API, database summary API, and database summary command are wired.

## Updated Database Contract

Application 2 expects the updated DD2975 database shape used by `sql_admin/create_db.sql`:

- `ASSESSMENT.assessment_id` is `BIGINT`.
- `RESPONSE.deployer_response_id` is `BIGINT`.
- `FIELD.field_code` is not unique.
- `FIELD.field_name` is unique and is the stable response lookup key.
- `FIELD.question` stores display question text.
- App2 reads response values through `dbo.vw_Response`, not directly from `dbo.RESPONSE`.
- Response-backed mapping rules should use `RESP_FIELD:<field_name>`. Legacy `RESP:<question_code>:<field_name>` rules are still accepted.
- Export metadata comes from `EXPORT_SPEC`, `EXPORT_FIELD`, `VALUE_DOMAIN`, `MAPPING_SET`, and `MAPPING_RULE`.

The local seed script `sql_admin/populate_app2_export_catalog.sql` creates the current staging export catalog. It covers the known 20-field prealpha fixed-width slice, not the full Navy DD2975 layout.

## Ink UI

Run the dashboard with:

```bash
npm run ui:app2
```

The same UI is also available through the Application 2 entrypoint:

```bash
node --import tsx Application/02/main.ts ui
```

By default, the dashboard uses the live Application 2 database status and summary helpers. It selects one configured database namespace in this order: `APP2_DB_*`, then `EXPORT_DB_*`, then `DB_*`.

With a live App2 export-schema database, the UI also shows an export section. When a latest run, export spec, and mapping set are available, press `e` to run export from the UI. Progress is shown record by record, and completion shows the output path, record count, export file ID, and validation error count.

For customer demo rehearsals where SQL Server is unavailable, use saved demo data:

```bash
APP2_UI_DEMO_DATA_PATH=out/milestones/demo/fixtures/app2_ui_demo_data.json npm run ui:app2
```

When saved data is used, the dashboard displays:

```text
Data source: saved demo data
```

Live mode displays:

```text
Data source: live database
```

Saved demo data must be sanitized JSON. Do not put passwords, connection strings, external database addresses, raw `.env` values, or real customer data in the fixture. Saved demo mode is read-only and does not enable live export.

Live UI export prerequisites:

- One database namespace is configured for the Application 2 export-schema database. `APP2_DB_*` wins when present; otherwise App2 selects `EXPORT_DB_*`, then `DB_*`.
- Required tables and views exist, including `RUN`, `ASSESSMENT`, `FIELD`, `RESPONSE`, `dbo.vw_Response`, `EXPORT_SPEC`, `EXPORT_FIELD`, `MAPPING_SET`, `MAPPING_RULE`, `EXPORT_FILE`, and `VALIDATION_ERROR`.
- `sql_admin/populate_fields.sql` and `sql_admin/populate_app2_export_catalog.sql` have been run against the selected staging database.
- `GET /database/summary` can find a latest run.
- `db-summary` can find at least one form with an export spec ID and mapping set ID.

Manual UI smoke checks:

```bash
APP2_UI_DEMO_DATA_PATH=out/milestones/demo/fixtures/app2_ui_demo_data.json npm run ui:app2
```

The saved-demo smoke should show `Data source: saved demo data` and `Export unavailable: saved demo data is not a live database.`

When a live App2 DB is intentionally configured:

```bash
npm run ui:app2
node --import tsx Application/02/main.ts ui
```

The live smoke should show `Data source: live database`. If export prerequisites are present, the export section should show `Export: ready | Press e to export`; pressing `e` should show record progress and then `Export: complete`.

## CLI

Run the CLI with the root project toolchain:

```text
node --import tsx Application/02/main.ts --help
```

Ink UI command:

```text
node --import tsx Application/02/main.ts ui
```

Export command:

```text
node --import tsx Application/02/main.ts export --run-id <uuid> --export-spec-id <uuid> --mapping-set-id <uuid> --out <path> [--json]
```

Database form-summary command:

```text
node --import tsx Application/02/main.ts db-summary [--json]
```

If you want Node to load the repository `.env` file directly, include `--env-file=.env`:

```bash
node --env-file=.env --import tsx Application/02/main.ts db-summary
```

App1 and App2 share the same database selection rules. App2 prefers `APP2_DB_*`, but it can use the same physical database as the export or root DB settings. If `APP2_DB_*` is missing, App2 logs an info message and selects `EXPORT_DB_*`, then `DB_*`. Once a namespace is selected, a connection failure is reported instead of silently connecting to a lower-priority database.

Explicit `APP2_DB_*` values are still useful when you want App2 to ignore other database settings:

```bash
set -a; source .env; set +a

APP2_DB_SERVER="${EXPORT_DB_SERVER:-$DB_SERVER}" \
APP2_DB_PORT="${EXPORT_DB_PORT:-${DB_PORT:-1433}}" \
APP2_DB_DATABASE="$EXPORT_DB_DATABASE" \
APP2_DB_USER="$EXPORT_DB_USER" \
APP2_DB_PASSWORD="$EXPORT_DB_PASSWORD" \
APP2_DB_ENCRYPT="${EXPORT_DB_ENCRYPT:-${DB_ENCRYPT:-false}}" \
APP2_DB_TRUST_SERVER_CERTIFICATE="${EXPORT_DB_TRUST_SERVER_CERTIFICATE:-${DB_TRUST_SERVER_CERTIFICATE:-true}}" \
node --import tsx Application/02/main.ts db-summary
```

## Seed And Verification Workflow

For an already-created updated staging database, run the field and export-catalog seeds in this order:

```bash
sqlcmd -No -S "$APP2_DB_SERVER,$APP2_DB_PORT" \
  -U "$APP2_DB_USER" \
  -P "$APP2_DB_PASSWORD" \
  -d "$APP2_DB_DATABASE" \
  -i sql_admin/populate_fields.sql

sqlcmd -No -S "$APP2_DB_SERVER,$APP2_DB_PORT" \
  -U "$APP2_DB_USER" \
  -P "$APP2_DB_PASSWORD" \
  -d "$APP2_DB_DATABASE" \
  -i sql_admin/populate_app2_export_catalog.sql
```

Then generate Application 1 data against the same database. Use either the Application 1 UI:

```bash
npm run ui:app1
```

or run the generator directly with `MSSQL_CONN_STRING` set in the shell, not committed to project files:

```bash
RANDOM_ROWS_ASSESSMENTS=5 RANDOM_ROWS_SEED=490 python3 Application/01/random_rows.py --mode full
```

After Application 1 inserts rows, confirm the selected database has a `RUN` row and target `ASSESSMENT` rows associated with that run. Then verify App2 metadata and export readiness:

```bash
node --env-file=.env --import tsx Application/02/main.ts db-summary
node --env-file=.env --import tsx Application/02/main.ts export --run-id <run-id> --export-spec-id <export-spec-id> --mapping-set-id <mapping-set-id> --out out/application_02_export.txt
```

On the updated database, the Application 1 generator creates a `RUN` row and prints `Run ID: <run-id>`. Use that `run_id`, plus the `export_spec_id` and `mapping_set_id` from `db-summary`. Saved demo data is useful for UI rehearsal, but it is not live App1-to-App2 verification.

DB-gated tests are skipped unless explicitly enabled:

```bash
RUN_APP2_DB_E2E=1 npm run test:app2:db
```

The export command pulls existing database records, transforms them with an existing mapping set, writes a fixed-width output file, persists validation errors, and finalizes the run.

```text
node --import tsx Application/02/main.ts export --run-id <uuid> --export-spec-id <uuid> --mapping-set-id <uuid> --out <path> [--json]
```

When an export run attempts to connect, the CLI writes connection lifecycle messages to stderr:

```text
Connecting to Application 2 database...
Application 2 database connection established.
```

If the database connection cannot be opened, stderr includes:

```text
Application 2 database connection failed.
```

Non-JSON export mode still writes only the final four summary lines to stdout and rewrites one per-record progress line on stderr with `\r`:

```text
\rApplication 2 export progress: 1/10 records written.\rApplication 2 export progress: 2/10 records written.
```

In `--json` mode, Application 2 emits NDJSON to stdout, one JSON object per line.

Current NDJSON event contract:

```json
{"type":"connect_start"}
{"type":"connect_ok"}
{"type":"record_progress","current":1,"total":10}
{"type":"complete","ok":true,"run_id":"run-id","export_file_id":"export-file-id","record_count":10,"out_path":"./out/application_02_export.txt","validation_error_count":0}
{"type":"error","ok":false,"error":"clear message"}
```

Stage 4 emits:

- success path: `connect_start`, `connect_ok`, zero or more `record_progress`, `complete`
- failure path before export completion: `connect_start`, `error`

Selection and connection logs are written to stderr and name only the environment namespace, not passwords or connection strings:

```text
Application 2 DB info: APP2_DB_* is not fully configured; using EXPORT_DB_* fallback.
Application 2 DB warning: connection failed for APP2_DB_*.
Application 2 database connection failed for APP2_DB_*.
```

The `db-summary` command is read-only. It opens the Application 2 database, reads form-definition metadata from `EXPORT_SPEC`, field metadata from `EXPORT_FIELD`, associated mapping UUIDs from `MAPPING_SET`, and prints a stable Markdown-style summary to stdout:

```text
Database: database_name
Forms: 1

## spec name spec version
Form UUIDs:
- export_spec_id: uuid
- mapping_set_ids: uuid

Fields:
1. DODID
   field_uuid: uuid
   question_code: DEM
   positions: 1-10
   length: 10
```

In `db-summary --json` mode, the command writes exactly one JSON object to stdout:

```json
{
  "ok": true,
  "database": "database_name",
  "forms": []
}
```

On failure, human-readable mode writes only sanitized error text to stderr. JSON mode writes exactly one JSON object to stdout:

```json
{
  "ok": false,
  "error": "clear message"
}
```

## Boundaries

- No nested package is required.
- The CLI opens one Application 2 database connection using the selected `APP2_DB_*`, `EXPORT_DB_*`, or `DB_*` namespace.
- The export command writes only the requested output path and database export/validation/run-status rows.
- The `db-summary` command is read-only and does not write files.
- The API uses Node's built-in `node:http`; no HTTP framework is required.
- `GET /database/status` is read-only and does not call the export workflow.
- `GET /database/summary` returns only aggregate counts and latest-row metadata.

## Database Configuration

Application 2 database helpers prefer this namespace:

```text
APP2_DB_SERVER
APP2_DB_PORT
APP2_DB_DATABASE
APP2_DB_USER
APP2_DB_PASSWORD
APP2_DB_ENCRYPT
APP2_DB_TRUST_SERVER_CERTIFICATE
APP2_DB_REQUEST_TIMEOUT_MS
```

If `APP2_DB_*` is not fully configured, App2 falls back to:

```text
EXPORT_DB_SERVER
EXPORT_DB_PORT
EXPORT_DB_DATABASE
EXPORT_DB_USER
EXPORT_DB_PASSWORD
EXPORT_DB_ENCRYPT
EXPORT_DB_TRUST_SERVER_CERTIFICATE
EXPORT_DB_REQUEST_TIMEOUT_MS
```

If `EXPORT_DB_*` is also not fully configured, App2 falls back to:

```text
DB_SERVER
DB_PORT
DB_DATABASE
DB_USER
DB_PASSWORD
DB_ENCRYPT
DB_TRUST_SERVER_CERTIFICATE
DB_REQUEST_TIMEOUT_MS
```

Each namespace must be internally complete for `SERVER`, `DATABASE`, `USER`, and `PASSWORD`. A partial or invalid namespace is skipped with a warning when a later namespace is complete.

## API

Run the API with the root project toolchain:

```text
node --import tsx Application/02/api.ts
```

The API entrypoint reads:

```text
APP2_API_HOST
APP2_API_PORT
```

Defaults:

```text
APP2_API_HOST=localhost
APP2_API_PORT=3002
```

`GET /database/status` is the canonical API endpoint for checking Application 2 database connectivity.

### `GET /database/status`

Success returns HTTP `200`:

```json
{
  "ok": true,
  "database": "database_name",
  "tables": {
    "RUN": true,
    "ASSESSMENT": true,
    "DEPLOYER": true,
    "FIELD": true,
    "RESPONSE": true,
    "vw_Response": true,
    "PROVIDER_REVIEW": true,
    "EXPORT_SPEC": true,
    "EXPORT_FIELD": true,
    "MAPPING_SET": true,
    "MAPPING_RULE": true,
    "EXPORT_FILE": true,
    "VALIDATION_ERROR": true
  }
}
```

Missing environment configuration, connection failures, and missing required tables or views return HTTP `503`:

```json
{
  "ok": false,
  "error": "clear sanitized message"
}
```

Unknown routes return HTTP `404`. Unsupported methods on API routes return HTTP `405`.

### `GET /database/summary`

Success returns HTTP `200`:

```json
{
  "ok": true,
  "database": "database_name",
  "counts": {
    "runs": 0,
    "deployers": 0,
    "assessments": 0,
    "responses": 0,
    "provider_reviews": 0,
    "export_specs": 0,
    "export_fields": 0,
    "mapping_sets": 0,
    "mapping_rules": 0,
    "export_files": 0,
    "validation_errors": 0
  },
  "latest_run": null,
  "latest_export_file": null
}
```

When present, `latest_run` includes only:

```json
{
  "run_id": "run-id",
  "run_name": "run name",
  "seed": 123,
  "target_record_count": 10,
  "started_at": "2026-02-14T00:00:00.000Z",
  "finished_at": null,
  "status": "finished"
}
```

When present, `latest_export_file` includes only:

```json
{
  "export_file_id": "export-file-id",
  "run_id": "run-id",
  "file_path": "./out/application_02_export.txt",
  "record_count": 10,
  "created_at": "2026-02-14T00:05:00.000Z"
}
```

Summary failures return HTTP `503`:

```json
{
  "ok": false,
  "error": "clear sanitized message"
}
```

Summary responses do not include raw table rows, response values, validation payloads, stack traces, passwords, or SQL connection details.

## Troubleshooting

### `db-summary` Returns `Database form summary check failed`

The CLI sanitizes database errors, so this message means the connection or metadata query failed. App2 selects `APP2_DB_*`, `EXPORT_DB_*`, then `DB_*`; confirm that the selected namespace points at the updated export-schema database.

If the UI opens and shows:

```text
Name: DD2975_PreDHA
```

then App2 connected to the older alpha1 database. The UI can show status and aggregate counts for that legacy schema, but `db-summary` and UI export need the updated Application 2 export schema.

The command expects Application 2 export catalog tables:

```text
dbo.EXPORT_SPEC
dbo.EXPORT_FIELD
dbo.MAPPING_SET
dbo.MAPPING_RULE
```

Live export also requires `dbo.vw_Response` for response-backed fields.

If the database has only the older alpha1 tables:

```text
dbo.ASSESSMENT
dbo.FIELD
dbo.RESPONSE
```

then `db-summary` cannot run against it. Point `APP2_DB_DATABASE` at a database whose schema matches `sql_admin/create_db.sql`, then run `sql_admin/populate_fields.sql` and `sql_admin/populate_app2_export_catalog.sql`.

To confirm the selected database without exposing connection values in project files:

```bash
sqlcmd -No -S "$APP2_DB_SERVER,$APP2_DB_PORT" \
  -U "$APP2_DB_USER" \
  -P "$APP2_DB_PASSWORD" \
  -d "$APP2_DB_DATABASE" \
  -Q "SELECT DB_NAME() AS database_name;"
```

To list visible user tables and views in the selected database:

```bash
sqlcmd -No -S "$APP2_DB_SERVER,$APP2_DB_PORT" \
  -U "$APP2_DB_USER" \
  -P "$APP2_DB_PASSWORD" \
  -d "$APP2_DB_DATABASE" \
  -Q "
SELECT DB_NAME() AS database_name;
SELECT s.name + '.' + o.name AS object_name, o.type_desc
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('U', 'V')
ORDER BY s.name, o.name;
"
```

## Transformation Modules

Application 2 now has isolated modules for:

- mapping source expression, transform pipeline, and pad-rule parsing
- writer-plan construction from raw mapping rows
- fixed-width line placement
- fixed-width stream writing
- export-record validation
