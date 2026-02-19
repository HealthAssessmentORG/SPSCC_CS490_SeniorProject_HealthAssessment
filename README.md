# SPSCC_CS490_SeniorProject_HealthAssessment
Generitive data fill for Health Assessment form data.

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

#### 4) Configure Environment Variables
Set these before running the program (per terminal session), or put them in your shell profile.
```bash
export DB_SERVER=localhost
export DB_PORT=1433
export DB_DATABASE=CS490_SeniorProject
export DB_USER=cs490_app
export DB_PASSWORD='password'
```
Verify connection as the app user:
```bash
sqlcmd -No -S "localhost,1433" -U "$DB_USER" -P "$DB_PASSWORD" -d master \
  -Q "SELECT SUSER_SNAME() AS whoami, @@SERVERNAME AS servername;"
```

## Running the App

### Run once (first time / fresh database)

This applies the schema in `./sql/00_schema.sql` then runs generation & export.

```bash
npx tsx main.ts \
  -form ./files/ExportFixedWidthForDD2975.xlsx \
  -gen 100 \
  --seed 0 \
  --out ./out/dd2975_prealpha_seed0.txt \
  --apply-schema
```

### Normal run (schema already exists)

```bash
npx tsx main.ts \
  -form ./files/ExportFixedWidthForDD2975.xlsx \
  -gen 100 \
  --seed 0 \
  --out ./out/dd2975_prealpha_seed0.txt
```
> Note: `--seed` controls deterministic generation. Re-running with the same seed will reproduce the same values.

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

