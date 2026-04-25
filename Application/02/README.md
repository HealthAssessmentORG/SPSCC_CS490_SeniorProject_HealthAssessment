# Application 2

Application 2 pulls existing database records, transforms them into export rows, writes fixed-width output, and exposes small database health APIs.

Current status: independent export flow, database status API, and database summary API are wired.

## CLI

Run the CLI with the root project toolchain:

```text
node --import tsx Application/02/main.ts --help
```

Export command:

```text
node --import tsx Application/02/main.ts export --run-id <uuid> --export-spec-id <uuid> --mapping-set-id <uuid> --out <path> [--json]
```

The export command pulls existing database records, transforms them with an existing mapping set, writes a fixed-width output file, persists validation errors, and finalizes the run.

```text
node --import tsx Application/02/main.ts export --run-id <uuid> --export-spec-id <uuid> --mapping-set-id <uuid> --out <path> [--json]
```

## Boundaries

- No nested package is required.
- The CLI opens only the Application 2 database connection namespace.
- The export command writes only the requested output path and database export/validation/run-status rows.
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

## Transformation Modules

Application 2 now has isolated modules for:

- mapping source expression, transform pipeline, and pad-rule parsing
- writer-plan construction from raw mapping rows
- fixed-width line placement
- fixed-width stream writing
- export-record validation
