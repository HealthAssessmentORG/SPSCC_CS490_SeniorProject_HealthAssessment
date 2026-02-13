/* sql_admin/00_create_db_and_app_login.sql */

-- 1) Create DB (if missing)
IF DB_ID(N'CS490_SeniorProject') IS NULL
BEGIN
  CREATE DATABASE [CS490_SeniorProject];
END
GO

-- 2) Create server login for the app (SQL auth)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'cs490_app')
BEGIN
  CREATE LOGIN [cs490_app]
    WITH PASSWORD = N'password',
         CHECK_POLICY = OFF,
         CHECK_EXPIRATION = OFF;
END
GO

-- 3) Create DB user + grant permissions
USE [CS490_SeniorProject];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'cs490_app')
BEGIN
  CREATE USER [cs490_app] FOR LOGIN [cs490_app];
END
GO

-- Minimum practical perms for your pipeline (create tables + read/write data)
ALTER ROLE db_ddladmin  ADD MEMBER [cs490_app];
ALTER ROLE db_datareader ADD MEMBER [cs490_app];
ALTER ROLE db_datawriter ADD MEMBER [cs490_app];
GO
