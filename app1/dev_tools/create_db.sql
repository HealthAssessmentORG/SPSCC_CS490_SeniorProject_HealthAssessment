USE [master];
GO
-- allows us to completely reset the database
IF DB_ID(N'DD2975_PreDHA') IS NOT NULL
BEGIN
    ALTER DATABASE [DD2975_PreDHA] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [DD2975_PreDHA];
END;
GO

CREATE DATABASE [DD2975_PreDHA];
GO

-- makes all future commands use this database
USE [DD2975_PreDHA];
GO

CREATE TABLE [dbo].[ASSESSMENT] (
    [assessment_id] BIGINT PRIMARY KEY IDENTITY(1,1)
);

CREATE TABLE [dbo].[FIELD] (
    [field_id] INT PRIMARY KEY IDENTITY(1,1),
    [field_code] CHAR(7) UNIQUE,
    [field_name] VARCHAR(511)
);

CREATE TABLE [dbo].[RESPONSE] (
    [deployer_response_id] BIGINT PRIMARY KEY IDENTITY(1,1),
    [assessment_id] BIGINT FOREIGN KEY REFERENCES [dbo].[ASSESSMENT]([assessment_id]),
    [field_id] INT FOREIGN KEY REFERENCES [dbo].[FIELD]([field_id]),
    [response] VARCHAR(255)
);