-- SQL script to create tables and view for the health assessment application

CREATE TABLE [dbo].[FIELD] (
    [field_id] INT PRIMARY KEY IDENTITY(1,1),
    [field_code] CHAR(25),
    [field_name] VARCHAR(100) UNIQUE,
    [question] VARCHAR(max)
);

CREATE TABLE [dbo].[RESPONSE] (
    [deployer_response_id] BIGINT PRIMARY KEY IDENTITY(1,1),
    [assessment_id] BIGINT FOREIGN KEY REFERENCES [dbo].[ASSESSMENT]([assessment_id]),
    [field_id] INT FOREIGN KEY REFERENCES [dbo].[FIELD]([field_id]),
    [response] NVARCHAR(max),
    value_norm NVARCHAR(max) NULL
);

CREATE INDEX IX_RESPONSE_assessment_id ON dbo.RESPONSE(assessment_id);
CREATE INDEX IX_RESPONSE_field_id ON dbo.RESPONSE(field_id);
GO

CREATE VIEW dbo.vw_Response
AS
    SELECT
        R.assessment_id,
        R.deployer_response_id AS response_id,
        RTRIM(F.field_code) AS question_code,
        F.field_name AS field_name,
        R.response AS value_raw,
        R.value_norm AS value_norm
    FROM dbo.RESPONSE AS R
    INNER JOIN dbo.FIELD AS F
        ON R.field_id = F.field_id;
GO
