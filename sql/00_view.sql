-- SQL script to create tables and view for the health assessment application

CREATE TABLE [dbo].[FIELD] (
    [field_id] INT PRIMARY KEY IDENTITY(1,1),
    [field_code] CHAR(7) UNIQUE,
    [field_name] VARCHAR(511)
);

CREATE TABLE [dbo].[RESPONSE] (
    [deployer_response_id] BIGINT PRIMARY KEY IDENTITY(1,1),
    [assessment_id] BIGINT FOREIGN KEY REFERENCES [dbo].[ASSESSMENT]([assessment_id]),
    [field_id] INT FOREIGN KEY REFERENCES [dbo].[FIELD]([field_id]),
    [response] NVARCHAR(max),
    value_norm NVARCHAR(max) NULL,
);

CREATE INDEX IX_RESPONSE_assessment_id ON dbo.RESPONSE(assessment_id);
CREATE INDEX IX_RESPONSE_q_field ON dbo.RESPONSE(field_id, field_name);
GO

CREATE VIEW dbo.vw_Response
    SELECT
        deployer_response_id AS response_id
        field_code as question_code,
        f.field_name as field_name,
        response as value_raw,
        value_norm as value_norm
        FROM DBO.RESPONSE R
            INNER JOIN FIELD F
                ON field_id = F.field_id
GO