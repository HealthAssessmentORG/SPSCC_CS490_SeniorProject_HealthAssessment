USE [master];
GO
-- allows us to completely reset the database
IF DB_ID(N'DD2975_PreDHA_Test') IS NOT NULL
BEGIN
    ALTER DATABASE [DD2975_PreDHA_Test] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [DD2975_PreDHA_Test];
END;
GO

CREATE DATABASE [DD2975_PreDHA_Test];
GO

-- makes all future commands use this database
USE [DD2975_PreDHA_Test];
GO
/* ===== Core run + generated data ===== */

CREATE TABLE dbo.[RUN] (
    run_id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_RUN PRIMARY KEY,
    run_name            NVARCHAR(200) NULL,
    seed                INT NULL,
    target_record_count INT NOT NULL CONSTRAINT DF_RUN_target_record_count DEFAULT (0),
    started_at          DATETIME2(0) NOT NULL CONSTRAINT DF_RUN_started_at DEFAULT (SYSUTCDATETIME()),
    finished_at         DATETIME2(0) NULL,
    status              NVARCHAR(30) NOT NULL CONSTRAINT DF_RUN_status DEFAULT (N'created')
);
GO

CREATE TABLE dbo.DEPLOYER (
    deployer_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DEPLOYER PRIMARY KEY,
    dod_id      CHAR(10) NOT NULL,
    CONSTRAINT UQ_DEPLOYER_dod_id UNIQUE (dod_id),
    CONSTRAINT CK_DEPLOYER_dod_id_digits
        CHECK (LEN(dod_id) = 10 AND dod_id NOT LIKE '%[^0-9]%')
);
GO

CREATE TABLE [dbo].[ASSESSMENT] (
    [assessment_id] BIGINT PRIMARY KEY IDENTITY(1,1),
    run_id                UNIQUEIDENTIFIER NOT NULL,
    deployer_id           UNIQUEIDENTIFIER NULL,
    form_type_observed    NVARCHAR(20) NULL,
    form_version_observed NVARCHAR(50) NULL,
    event_date            DATE NULL,

    CONSTRAINT FK_ASSESSMENT_RUN
        FOREIGN KEY (run_id) REFERENCES dbo.[RUN](run_id) ON DELETE CASCADE,
    CONSTRAINT FK_ASSESSMENT_DEPLOYER
        FOREIGN KEY (deployer_id) REFERENCES dbo.DEPLOYER(deployer_id)
);
GO

CREATE INDEX IX_ASSESSMENT_run_id ON dbo.ASSESSMENT(run_id);
CREATE INDEX IX_ASSESSMENT_deployer_id ON dbo.ASSESSMENT(deployer_id);
GO

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
GO
CREATE VIEW dbo.vw_Response
	AS
    SELECT
        deployer_response_id AS response_id,
        field_code as question_code,
        f.field_name as field_name,
        response as value_raw,
        value_norm as value_norm
        FROM DBO.RESPONSE R
            INNER JOIN FIELD F
                ON r.field_id = F.field_id
GO

CREATE TABLE dbo.PROVIDER_REVIEW (
    assessment_id      BIGINT NOT NULL CONSTRAINT PK_PROVIDER_REVIEW PRIMARY KEY,
    provider_name      NVARCHAR(200) NULL,
    certify_date       DATE NULL,
    provider_title     NVARCHAR(50) NULL,
    provider_signature NVARCHAR(200) NULL,

    CONSTRAINT FK_PROVIDER_REVIEW_ASSESSMENT
        FOREIGN KEY (assessment_id) REFERENCES dbo.ASSESSMENT(assessment_id) ON DELETE CASCADE
);
GO

/* ===== Export spec catalog ===== */

CREATE TABLE dbo.EXPORT_SPEC (
    export_spec_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_EXPORT_SPEC PRIMARY KEY,
    spec_name      NVARCHAR(200) NOT NULL,
    spec_version   NVARCHAR(50)  NOT NULL,
    row_length     INT NOT NULL,

    CONSTRAINT UQ_EXPORT_SPEC_name_ver UNIQUE (spec_name, spec_version),
    CONSTRAINT CK_EXPORT_SPEC_row_length CHECK (row_length > 0)
);
GO

CREATE TABLE dbo.VALUE_DOMAIN (
    domain_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_VALUE_DOMAIN PRIMARY KEY,
    domain_type NVARCHAR(50) NOT NULL,
    raw_spec    NVARCHAR(4000) NULL,

    CONSTRAINT UQ_VALUE_DOMAIN UNIQUE (domain_type, raw_spec)
);
GO

CREATE TABLE dbo.DOMAIN_ENUM_VALUE (
    domain_enum_value_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DOMAIN_ENUM_VALUE PRIMARY KEY,
    domain_id            UNIQUEIDENTIFIER NOT NULL,
    code                 NVARCHAR(50) NOT NULL,
    meaning              NVARCHAR(200) NULL,

    CONSTRAINT FK_DOMAIN_ENUM_VALUE_DOMAIN
        FOREIGN KEY (domain_id) REFERENCES dbo.VALUE_DOMAIN(domain_id) ON DELETE CASCADE,
    CONSTRAINT UQ_DOMAIN_ENUM_VALUE UNIQUE (domain_id, code)
);
GO

CREATE TABLE dbo.EXPORT_FIELD (
    export_field_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_EXPORT_FIELD PRIMARY KEY,
    export_spec_id   UNIQUEIDENTIFIER NOT NULL,
    domain_id        UNIQUEIDENTIFIER NULL,
    field_order      INT NOT NULL,
    question_code    NVARCHAR(50) NULL,
    field_name       NVARCHAR(100) NOT NULL,
    start_pos        INT NOT NULL,
    end_pos          INT NOT NULL,
    field_length     AS (end_pos - start_pos + 1) PERSISTED,
    description      NVARCHAR(1000) NULL,
    values_spec_raw  NVARCHAR(4000) NULL,

    CONSTRAINT FK_EXPORT_FIELD_SPEC
        FOREIGN KEY (export_spec_id) REFERENCES dbo.EXPORT_SPEC(export_spec_id) ON DELETE CASCADE,
    CONSTRAINT FK_EXPORT_FIELD_DOMAIN
        FOREIGN KEY (domain_id) REFERENCES dbo.VALUE_DOMAIN(domain_id),
    CONSTRAINT UQ_EXPORT_FIELD_order UNIQUE (export_spec_id, field_order),
    CONSTRAINT UQ_EXPORT_FIELD_name UNIQUE (export_spec_id, field_name),
    CONSTRAINT CK_EXPORT_FIELD_pos CHECK (start_pos >= 1 AND end_pos >= start_pos)
);
GO

CREATE INDEX IX_EXPORT_FIELD_spec ON dbo.EXPORT_FIELD(export_spec_id);
GO

/* ===== Mapping catalog ===== */

CREATE TABLE dbo.MAPPING_SET (
    mapping_set_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_MAPPING_SET PRIMARY KEY,
    export_spec_id         UNIQUEIDENTIFIER NOT NULL,
    form_version_observed  NVARCHAR(50) NULL,
    mapping_name           NVARCHAR(200) NOT NULL,
    mapping_version        INT NOT NULL,
    created_at             DATETIME2(0) NOT NULL CONSTRAINT DF_MAPPING_SET_created_at DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_MAPPING_SET_SPEC
        FOREIGN KEY (export_spec_id) REFERENCES dbo.EXPORT_SPEC(export_spec_id) ON DELETE CASCADE,
    CONSTRAINT UQ_MAPPING_SET_ver UNIQUE (export_spec_id, mapping_version, form_version_observed)
);
GO

CREATE TABLE dbo.MAPPING_RULE (
    mapping_rule_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_MAPPING_RULE PRIMARY KEY,
    mapping_set_id      UNIQUEIDENTIFIER NOT NULL,
    export_field_id     UNIQUEIDENTIFIER NOT NULL,
    source_expression   NVARCHAR(1000) NOT NULL,
    transform_pipeline  NVARCHAR(1000) NULL,
    default_value       NVARCHAR(200) NULL,
    pad_rule            NVARCHAR(200) NULL,

    CONSTRAINT FK_MAPPING_RULE_SET
        FOREIGN KEY (mapping_set_id) REFERENCES dbo.MAPPING_SET(mapping_set_id) ON DELETE CASCADE,
    CONSTRAINT FK_MAPPING_RULE_FIELD
        FOREIGN KEY (export_field_id) REFERENCES dbo.EXPORT_FIELD(export_field_id) ON DELETE NO ACTION,
    CONSTRAINT UQ_MAPPING_RULE UNIQUE (mapping_set_id, export_field_id)
);
GO

CREATE INDEX IX_MAPPING_RULE_set ON dbo.MAPPING_RULE(mapping_set_id);
GO

/* ===== Output + validation ===== */

CREATE TABLE dbo.EXPORT_FILE (
    export_file_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_EXPORT_FILE PRIMARY KEY,
    run_id         UNIQUEIDENTIFIER NOT NULL,
    mapping_set_id UNIQUEIDENTIFIER NOT NULL,
    file_path      NVARCHAR(1024) NOT NULL,
    record_count   INT NOT NULL,
    created_at     DATETIME2(0) NOT NULL CONSTRAINT DF_EXPORT_FILE_created_at DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_EXPORT_FILE_RUN
        FOREIGN KEY (run_id) REFERENCES dbo.[RUN](run_id) ON DELETE CASCADE,
    CONSTRAINT FK_EXPORT_FILE_MAPPING_SET
        FOREIGN KEY (mapping_set_id) REFERENCES dbo.MAPPING_SET(mapping_set_id)
);
GO

CREATE TABLE dbo.VALIDATION_ERROR (
    validation_error_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_VALIDATION_ERROR PRIMARY KEY,
    export_file_id      UNIQUEIDENTIFIER NOT NULL,
    record_ordinal      INT NOT NULL,
    export_field_name   NVARCHAR(100) NOT NULL,
    error_code          NVARCHAR(50) NOT NULL,
    expected            NVARCHAR(4000) NULL,
    actual              NVARCHAR(4000) NULL,
    message             NVARCHAR(2000) NULL,

    CONSTRAINT FK_VALIDATION_ERROR_FILE
        FOREIGN KEY (export_file_id) REFERENCES dbo.EXPORT_FILE(export_file_id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_VALIDATION_ERROR_file ON dbo.VALIDATION_ERROR(export_file_id);
GO
