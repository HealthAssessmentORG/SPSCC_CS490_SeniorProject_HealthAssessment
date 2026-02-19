# SPSCC_CS490_SeniorProject_HealthAssessment
Generitive data fill for Health Assessment form data.

## Prerequisites

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





## To Run
* https://docs.microsoft.com/en-us/sql/linux
* npm i after git pull for node modules
* *wip*

Run once

`npx tsx main.ts -form ./files/ExportFixedWidthForDD2975.xlsx -gen 100 --seed 0 --out ./out/dd2975_prealpha_seed0.txt --apply-schema`

Run:

`npx tsx main.ts -form ./files/ExportFixedWidthForDD2975.xlsx -gen 100 --seed 0 --out ./out/dd2975_prealpha_seed0.txt`
