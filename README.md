# SPSCC_CS490_SeniorProject_HealthAssessment
Generitive data fill for Health Assessment form data.

## Usage Info

### Application 01
```
npm run ui:app1
```

### Application 02
```
npm run ui:app2
```

### Application 03
```
npm run ui:app3
```

## Steps for Windows

### 1.) Install Node.js
https://nodejs.org/en/download/current

### 2.) Open Terminal in Project Folder and run:
```bash
npm i
```
```bash
npm install tedious
```
### 3.) Open .venv with Server Address
```bash
.venv\Scripts\activate
```
### 4.) Run program
```bash
npx tsx main.ts -form ./files/ExportFixedWidthForSmoke.xlsx -gen 100 --seed 0 --mapping-profile spec --out ./out/dd2975_prealpha_seed0.txt
```
---
## Prerequisites
* https://docs.microsoft.com/en-us/sql/linux
* TypeScript
* Comfortable using terminal commands

### 1) SQL Server (Linux) + `sqlcmd`
Install SQL Server + tools following Microsoft docs:
- https://learn.microsoft.com/en-us/sql/linux/

If `sqlcmd` fails with a self-signed cert error (common with ODBC 18), use `-No`:
```bash
sqlcmd -No -S "localhost,1433" -U "sa" -P 'your_sa_password' -Q "SELECT @@VERSION;"
```
### 2) Node.js + npm
Install Node.js (works with modern Node + tsx) and then install dependencies:
`npm i`

### 3) One-time Database Setup
This project expects an application database and a SQL login/user.

> Local dev defaults shown below. Change passwords before any shared/non-local use.

#### 3.A) Create database
```bash
sqlcmd -No -S "localhost,1433" -U "sa" -P 'password' -d master -b -Q "
IF DB_ID('CS490_SeniorProject') IS NULL
  CREATE DATABASE [CS490_SeniorProject];
"
```

#### 3.B) Create app login + DB user + permissions
##### Create server login (if missing)
```bash
sqlcmd -No -S "localhost,1433" -U "sa" -P 'password' -d master -b -Q "
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'cs490_app')
BEGIN
  CREATE LOGIN [cs490_app]
    WITH PASSWORD = N'password',
         CHECK_POLICY = OFF,
         CHECK_EXPIRATION = OFF;
END
"
```

##### Create DB user + grant roles
```bash
sqlcmd -No -S "localhost,1433" -U "sa" -P 'password' -d CS490_SeniorProject -b -Q "
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'cs490_app')
  CREATE USER [cs490_app] FOR LOGIN [cs490_app];

ALTER ROLE db_ddladmin    ADD MEMBER [cs490_app];
ALTER ROLE db_datareader  ADD MEMBER [cs490_app];
ALTER ROLE db_datawriter  ADD MEMBER [cs490_app];
"
```

#### 4) Configure Export Environment Variables
Set these before running the preserved export workflow in `main_export.ts`.
```bash
export EXPORT_DB_SERVER=localhost
export EXPORT_DB_PORT=1433
export EXPORT_DB_DATABASE=CS490_SeniorProject
export EXPORT_DB_USER=cs490_app
export EXPORT_DB_PASSWORD='password'
```
Verify connection as the app user:
```bash
sqlcmd -No -S "localhost,1433" -U "$EXPORT_DB_USER" -P "$EXPORT_DB_PASSWORD" -d master \
  -Q "SELECT SUSER_SNAME() AS whoami, @@SERVERNAME AS servername;"
```

#### 5) Configure Alpha1 Environment
Set these before using the default alpha1 CLI in `main.ts`:
```bash
export DB_SERVER=24.18.27.110
export DB_PORT=1433
export DB_DATABASE=DD2975_PreDHA
export DB_USER=sa
export DB_PASSWORD='password'
export DB_ENCRYPT=false
export DB_TRUST_SERVER_CERTIFICATE=true
export DB_REQUEST_TIMEOUT_MS=0
```

## Running Alpha1

The default CLI now targets the current 3-table alpha1 database (`ASSESSMENT`, `FIELD`, `RESPONSE`).

### Check DB connectivity

```bash
node --import tsx main.ts check-db
node --import tsx main.ts check-db --json
```

### Load dynamic fields

```bash
node --import tsx main.ts fields
node --import tsx main.ts fields --json
```

### Generate assessment previews or inserts

```bash
node --import tsx main.ts generate -gen 1 --seed 123 --dry-run --json
node --import tsx main.ts generate -gen 1 --seed 123 --json
```

## Running the Export Workflow

### Run once (first time / fresh database)

This applies the schema in `./sql/00_schema.sql` then runs generation & export.

```bash
npx tsx main_export.ts \
  -form ./files/ExportFixedWidthForDD2975.xlsx \
  -gen 100 \
  --seed 0 \
  --mapping-profile spec \
  --out ./out/dd2975_prealpha_seed0.txt \
  --apply-schema
```

### Normal run (schema already exists)

```bash
npx tsx main_export.ts \
  -form ./files/ExportFixedWidthForDD2975.xlsx \
  -gen 100 \
  --seed 0 \
  --mapping-profile spec \
  --out ./out/dd2975_prealpha_seed0.txt
```
> Note: `--seed` controls deterministic generation. Re-running with the same seed will reproduce the same values.
> Note: default profile is `spec`, so the run follows the provided XLSX field/question metadata. Use `--mapping-profile prealpha` for the legacy hardcoded DD2795 behavior.

## Application 2 Database Form Summary

Application 2 can print a read-only summary of form definitions in the Application 2 export schema:

```bash
node --import tsx Application/02/main.ts db-summary
```

Application 2 reads only `APP2_DB_*` environment variables. If your `.env` currently has `EXPORT_DB_*` for the export schema, map them when running the command:

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

For machine-readable output:

```bash
node --import tsx Application/02/main.ts db-summary --json
```

### Legacy compatibility run

```bash
npx tsx main_export.ts \
  -form ./files/ExportFixedWidthForDD2975.xlsx \
  -gen 100 \
  --seed 0 \
  --mapping-profile prealpha \
  --out ./out/dd2975_prealpha_seed0.txt
```

### Output Notes (Fixed-Width “Looks Blank”)
The export file is fixed-width and can appear blank in editors because it contains many spaces.

Quick sanity checks:
```bash
wc -l ./out/dd2975_prealpha_seed0.txt
wc -c ./out/dd2975_prealpha_seed0.txt

# show first 200 chars with whitespace visible
head -n 1 ./out/dd2975_prealpha_seed0.txt | cut -c1-200 | cat -A

# confirm row length (expect 5172)
awk '{print length($0)}' ./out/dd2975_prealpha_seed0.txt | head
```

**Tip:** view in `terminal` with horizontal scrolling:

```bash
less -S ./out/dd2975_prealpha_seed0.txt
```

## Troubleshooting

### `db-summary`: `Database form summary check failed`

This command expects the Application 2 export schema, not the older alpha1 3-table database.

Required tables include:

```text
dbo.EXPORT_SPEC
dbo.EXPORT_FIELD
dbo.MAPPING_SET
```

If the underlying SQL error is:

```text
Invalid object name 'dbo.EXPORT_SPEC'
```

then `APP2_DB_DATABASE` is pointing at the wrong database or the schema has not been applied. The older `DD2975_PreDHA` database has only:

```text
dbo.ASSESSMENT
dbo.FIELD
dbo.RESPONSE
```

That older schema cannot be summarized by `Application/02/main.ts db-summary`. Point `APP2_DB_DATABASE` at the database created from `sql/00_schema.sql`, or run the export workflow setup with `--apply-schema` against the intended export database.

To confirm which database and tables the login can see:

List visible non-system databases for the export login:

```bash
sqlcmd -No -S "$EXPORT_DB_SERVER,$EXPORT_DB_PORT" \
  -U "$EXPORT_DB_USER" \
  -P "$EXPORT_DB_PASSWORD" \
  -d master \
  -Q "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name;"
```

Then inspect the selected Application 2 database tables:

```bash
sqlcmd -No -S "$APP2_DB_SERVER,$APP2_DB_PORT" -U "$APP2_DB_USER" -P "$APP2_DB_PASSWORD" -d "$APP2_DB_DATABASE" -Q "
SELECT DB_NAME() AS database_name;
SELECT s.name + '.' + t.name AS table_name
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
ORDER BY s.name, t.name;
"
```

### “There is already an object named 'RUN'”

You re-ran `--apply-schema` on an existing schema. Use the normal run command (no `--apply-schema`), or reset the DB.

#### Reset the database (dev only)
```bash
sqlcmd -No -S "localhost,1433" -U "sa" -P 'password' -d master -b -Q "
IF DB_ID('CS490_SeniorProject') IS NOT NULL
BEGIN
  ALTER DATABASE [CS490_SeniorProject] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [CS490_SeniorProject];
END
CREATE DATABASE [CS490_SeniorProject];
"
```
Then re-run the “Create app login/user + permissions” steps and run with `--apply-schema`.

#### SQLCMD SSL error: “certificate verify failed: self-signed certificate”

Use: `sqlcmd -No ...` (trust server certificate) or configure certificates properly.
