# Application 2

Application 2 pulls existing database records, transforms them into export rows, writes fixed-width output, and exposes small database health APIs.

Current status: independent export flow, database status API, database summary API, and database summary command are wired.

## CLI

Run the CLI with the root project toolchain:

```text
node --import tsx Application/02/main.ts --help
```

Export command:

```text
node --import tsx Application/02/main.ts export --run-id <uuid> --export-spec-id <uuid> --mapping-set-id <uuid> --out <path> [--json]
```

Database form-summary command:

```text
node --import tsx Application/02/main.ts db-summary [--json]
```

When using values from the root `.env`, map the export database settings into the Application 2 namespace:

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
- The CLI opens only the Application 2 database connection namespace.
- The export command writes only the requested output path and database export/validation/run-status rows.
- The `db-summary` command is read-only and does not write files.
- The API uses Node's built-in `node:http`; no HTTP framework is required.
- `GET /database/status` is read-only and does not call the export workflow.
- `GET /database/summary` returns only aggregate counts and latest-row metadata.

## Database Configuration

Application 2 database helpers read only this isolated environment namespace:

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

The Application 2 database layer does not read `DB_*` or `EXPORT_DB_*`.

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
APP2_API_HOST=127.0.0.1
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
    "RESPONSE": true,
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

Missing environment configuration, connection failures, and missing required tables return HTTP `503`:

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

The CLI sanitizes database errors, so this message means the connection or metadata query failed. The command expects an Application 2 export-schema database with these tables:

```text
dbo.EXPORT_SPEC
dbo.EXPORT_FIELD
dbo.MAPPING_SET
```

If the database has only the older alpha1 tables:

```text
dbo.ASSESSMENT
dbo.FIELD
dbo.RESPONSE
```

then `db-summary` cannot run against it. Point `APP2_DB_DATABASE` at the database created from `sql/00_schema.sql`, or apply the export schema to the intended export database before running the command.

To confirm the selected database and visible tables:

```bash
sqlcmd -No -S "$APP2_DB_SERVER,$APP2_DB_PORT" -U "$APP2_DB_USER" -P "$APP2_DB_PASSWORD" -d "$APP2_DB_DATABASE" -Q "
SELECT DB_NAME() AS database_name;
SELECT s.name + '.' + t.name AS table_name
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
ORDER BY s.name, t.name;
"
```

## Transformation Modules

Application 2 now has isolated modules for:

- mapping source expression, transform pipeline, and pad-rule parsing
- writer-plan construction from raw mapping rows
- fixed-width line placement
- fixed-width stream writing
- export-record validation
