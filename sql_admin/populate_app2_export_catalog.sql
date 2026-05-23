/*
    Populate the Application 2 export catalog for the update-3 staging path.

    Usage:
      1. Run this against a staging copy of the updated DD2975 database.
      2. Run after sql_admin/populate_fields.sql so dbo.FIELD contains the Navy
         field names and question text.

    Scope:
      This seeds the known 20-field DD2975 prealpha slice whose fixed-width
      positions are present in sql_seed/01_seed_prealpha_20fields_100.sql.
      sql_admin/field_name_value_list_generator.xlsx and
      sql_admin/populate_fields.sql provide field names, field codes,
      questions, and value hints, but they do not provide complete fixed-width
      order or start/end positions. The script therefore fails loudly when
      source FIELD rows are missing and does not invent a full Navy layout.

    Safety:
      - No database reset, DROP DATABASE, or schema changes.
      - Idempotent for the target spec name/version below.
      - Deletes and replaces EXPORT_FIELD and MAPPING_RULE rows only for the
        target export spec/mapping set.
      - Does not rely on FIELD.field_code uniqueness; FIELD.field_name is the
        lookup key.
*/

SET XACT_ABORT ON;

DECLARE @spec_name NVARCHAR(200) = N'DD2975_update3_prealpha';
DECLARE @spec_version NVARCHAR(50) = N'prealpha_20_20260524';
DECLARE @mapping_name NVARCHAR(200) = N'update3_prealpha_20';
DECLARE @mapping_version INT = 3;
DECLARE @form_version_observed NVARCHAR(50) = N'DD2795_202006';
DECLARE @row_length INT = 5172;

DECLARE @preferred_export_spec_id UNIQUEIDENTIFIER = '29750000-0000-0000-0003-000000000001';
DECLARE @preferred_mapping_set_id UNIQUEIDENTIFIER = '29750000-0000-0000-0003-000000000002';

DECLARE @fields TABLE (
    field_order INT NOT NULL PRIMARY KEY,
    field_name NVARCHAR(100) NOT NULL UNIQUE,
    start_pos INT NOT NULL,
    end_pos INT NOT NULL,
    description NVARCHAR(1000) NOT NULL,
    values_spec_raw NVARCHAR(4000) NOT NULL,
    domain_type NVARCHAR(50) NOT NULL,
    domain_raw_spec NVARCHAR(4000) NULL,
    source_expression NVARCHAR(1000) NULL,
    transform_pipeline NVARCHAR(1000) NOT NULL,
    default_value NVARCHAR(200) NULL,
    pad_rule NVARCHAR(200) NOT NULL
);

INSERT INTO @fields (
    field_order,
    field_name,
    start_pos,
    end_pos,
    description,
    values_spec_raw,
    domain_type,
    domain_raw_spec,
    source_expression,
    transform_pipeline,
    default_value,
    pad_rule
)
VALUES
    (1,  N'FORM_TYPE',       1,    5,    N'Type of Form',                   N'PRE',                                  N'TEXT',            N'free text',      N'COL:ASSESSMENT.form_type_observed',       N'trim',          N'PRE',           N'pad:right:space'),
    (2,  N'FORM_VERSION',    6,   20,    N'DoD Form Version',               N'DD2795_202006',                        N'TEXT',            N'free text',      N'COL:ASSESSMENT.form_version_observed',    N'trim',          N'DD2795_202006', N'pad:right:space'),
    (3,  N'LNAME',          21,   45,    N'Last Name',                      N'Text Field',                           N'TEXT',            N'free text',      NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (4,  N'FNAME',          46,   70,    N'First Name',                     N'Text Field',                           N'TEXT',            N'free text',      NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (5,  N'MI',             71,   71,    N'Middle Initial',                 N'Text Field',                           N'TEXT',            N'free text',      NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (6,  N'DODID',          72,   81,    N'DoD ID number (formerly EDIPI)', N'9999999999',                           N'DODID10',         N'^\d{10}$',      N'COL:DEPLOYER.dod_id',                     N'trim',          N'',              N'pad:right:space'),
    (7,  N'D_EVENT',        82,   89,    N'Today''s Date (date on form)',   N'YYYYMMDD',                             N'DATE_YYYYMMDD',   N'YYYYMMDD (112)', N'COL:ASSESSMENT.event_date',               N'date:yyyymmdd', N'',              N'pad:right:space'),
    (8,  N'DOB',            90,   97,    N'Date of Birth',                  N'YYYYMMDD',                             N'DATE_YYYYMMDD',   N'YYYYMMDD (112)', NULL,                                           N'date:yyyymmdd', N'',              N'pad:right:space'),
    (9,  N'SEX',            98,   98,    N'Sex',                            N'M=Male, F=Female',                     N'ENUM_SEX',        N'M=Male, F=Female', NULL,                                        N'trim',          N'',              N'pad:right:space'),
    (10, N'FORM_SERVICE',   99,   99,    N'Service Branch',                 N'see spec raw',                         N'ENUM_SERVICE',    N'see spec raw',   NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (11, N'FORM_COMPONENT', 125, 127,    N'Component',                      N'A=Active Duty, N=National Guard, R=Reserves, X=Civilian Gov Employee', N'ENUM_COMPONENT', N'A/N/R/X', NULL,                          N'trim',          N'',              N'pad:right:space'),
    (12, N'GRADE',          128, 130,    N'Pay Grade',                      N'see spec raw',                         N'ENUM_PAY_GRADE',  N'see spec raw',   NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (13, N'UNIT_NAME',      156, 230,    N'Unit Name',                      N'Text Field',                           N'TEXT',            N'free text',      NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (14, N'UNIT_LOC',       231, 305,    N'Duty Station/Location',          N'Text Field',                           N'TEXT',            N'free text',      NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (15, N'EMAIL',          366, 440,    N'Current Email',                  N'Text Field',                           N'TEXT',            N'free text',      NULL,                                           N'trim|lower',    N'',              N'pad:right:space'),
    (16, N'TRICARE',        5008, 5008,  N'TRICARE PROVIDER',               N'Y=Checked, N=Not checked',             N'ENUM_YN',         N'Y/N',            NULL,                                           N'trim',          N'',              N'pad:right:space'),
    (17, N'PROVIDER_NAME',  5113, 5162,  N'Provider''s Name',               N'Text Field',                           N'TEXT',            N'free text',      N'COL:PROVIDER_REVIEW.provider_name',       N'trim',          N'',              N'pad:right:space'),
    (18, N'CERTIFY_DATE',   5163, 5170,  N'Date Certified',                 N'YYYYMMDD',                             N'DATE_YYYYMMDD',   N'YYYYMMDD (112)', N'COL:PROVIDER_REVIEW.certify_date',        N'date:yyyymmdd', N'',              N'pad:right:space'),
    (19, N'PROVIDER_TITLE', 5171, 5171,  N'Provider''s title',              N'1=MD or DO, 2=PA, 3=Nurse Practitioner, 4=Adv Practice Nurse, 5=IDMT, 6=IDC, 7=IDHS, 8=SFMS, blank=missing', N'ENUM_PROV_TITLE', N'1..8, blank', N'COL:PROVIDER_REVIEW.provider_title', N'trim',          N'',              N'pad:right:space'),
    (20, N'CERT_PROVIDER',  5172, 5172,  N'Provider''s Signature',          N'Provider Signature, "Y", "N"',         N'ENUM_YN',         N'Y/N',            N'COL:PROVIDER_REVIEW.provider_signature',  N'trim',          N'',              N'pad:right:space');

DECLARE @domains TABLE (
    domain_id UNIQUEIDENTIFIER NOT NULL,
    domain_type NVARCHAR(50) NOT NULL,
    raw_spec NVARCHAR(4000) NULL
);

INSERT INTO @domains (domain_id, domain_type, raw_spec)
VALUES
    ('29750000-0000-0000-0003-000000030001', N'TEXT',            N'free text'),
    ('29750000-0000-0000-0003-000000030002', N'DODID10',         N'^\d{10}$'),
    ('29750000-0000-0000-0003-000000030003', N'DATE_YYYYMMDD',   N'YYYYMMDD (112)'),
    ('29750000-0000-0000-0003-000000030004', N'ENUM_SEX',        N'M=Male, F=Female'),
    ('29750000-0000-0000-0003-000000030005', N'ENUM_SERVICE',    N'see spec raw'),
    ('29750000-0000-0000-0003-000000030006', N'ENUM_COMPONENT',  N'A/N/R/X'),
    ('29750000-0000-0000-0003-000000030007', N'ENUM_PAY_GRADE',  N'see spec raw'),
    ('29750000-0000-0000-0003-000000030008', N'ENUM_YN',         N'Y/N'),
    ('29750000-0000-0000-0003-000000030009', N'ENUM_PROV_TITLE', N'1..8, blank');

DECLARE @domain_enum_values TABLE (
    domain_enum_value_id UNIQUEIDENTIFIER NOT NULL,
    domain_type NVARCHAR(50) NOT NULL,
    raw_spec NVARCHAR(4000) NOT NULL,
    code NVARCHAR(50) NOT NULL,
    meaning NVARCHAR(200) NOT NULL
);

INSERT INTO @domain_enum_values (domain_enum_value_id, domain_type, raw_spec, code, meaning)
VALUES
    ('29750000-0000-0000-0003-000000040001', N'ENUM_SEX',        N'M=Male, F=Female', N'M', N'Male'),
    ('29750000-0000-0000-0003-000000040002', N'ENUM_SEX',        N'M=Male, F=Female', N'F', N'Female'),
    ('29750000-0000-0000-0003-000000040003', N'ENUM_YN',         N'Y/N',              N'Y', N'Yes/Checked'),
    ('29750000-0000-0000-0003-000000040004', N'ENUM_YN',         N'Y/N',              N'N', N'No/Not checked'),
    ('29750000-0000-0000-0003-000000040005', N'ENUM_COMPONENT',  N'A/N/R/X',          N'A', N'Active Duty'),
    ('29750000-0000-0000-0003-000000040006', N'ENUM_COMPONENT',  N'A/N/R/X',          N'N', N'National Guard'),
    ('29750000-0000-0000-0003-000000040007', N'ENUM_COMPONENT',  N'A/N/R/X',          N'R', N'Reserves'),
    ('29750000-0000-0000-0003-000000040008', N'ENUM_COMPONENT',  N'A/N/R/X',          N'X', N'Civilian Gov Employee'),
    ('29750000-0000-0000-0003-000000040009', N'ENUM_PROV_TITLE', N'1..8, blank',      N'1', N'MD or DO'),
    ('29750000-0000-0000-0003-000000040010', N'ENUM_PROV_TITLE', N'1..8, blank',      N'2', N'PA'),
    ('29750000-0000-0000-0003-000000040011', N'ENUM_PROV_TITLE', N'1..8, blank',      N'3', N'Nurse Practitioner'),
    ('29750000-0000-0000-0003-000000040012', N'ENUM_PROV_TITLE', N'1..8, blank',      N'4', N'Adv Practice Nurse'),
    ('29750000-0000-0000-0003-000000040013', N'ENUM_PROV_TITLE', N'1..8, blank',      N'5', N'IDMT'),
    ('29750000-0000-0000-0003-000000040014', N'ENUM_PROV_TITLE', N'1..8, blank',      N'6', N'IDC'),
    ('29750000-0000-0000-0003-000000040015', N'ENUM_PROV_TITLE', N'1..8, blank',      N'7', N'IDHS'),
    ('29750000-0000-0000-0003-000000040016', N'ENUM_PROV_TITLE', N'1..8, blank',      N'8', N'SFMS');

DECLARE @missing_field_count INT = (
    SELECT COUNT(*)
    FROM @fields seeded
    LEFT JOIN dbo.FIELD source_field
      ON source_field.field_name = seeded.field_name
    WHERE source_field.field_id IS NULL
);

IF @missing_field_count > 0
BEGIN
    SELECT seeded.field_name AS missing_field_name
    FROM @fields seeded
    LEFT JOIN dbo.FIELD source_field
      ON source_field.field_name = seeded.field_name
    WHERE source_field.field_id IS NULL
    ORDER BY seeded.field_order;

    THROW 51000, 'Cannot seed App2 export catalog: dbo.FIELD is missing required field_name rows. Run sql_admin/populate_fields.sql first.', 1;
END;

DECLARE @duplicate_field_name_count INT = (
    SELECT COUNT(*)
    FROM (
        SELECT field_name
        FROM dbo.FIELD
        WHERE field_name IN (SELECT field_name FROM @fields)
        GROUP BY field_name
        HAVING COUNT(*) > 1
    ) duplicates
);

IF @duplicate_field_name_count > 0
BEGIN
    SELECT field_name AS duplicate_field_name
    FROM dbo.FIELD
    WHERE field_name IN (SELECT field_name FROM @fields)
    GROUP BY field_name
    HAVING COUNT(*) > 1
    ORDER BY field_name;

    THROW 51001, 'Cannot seed App2 export catalog: dbo.FIELD.field_name must be unique for required fields.', 1;
END;

BEGIN TRY
    BEGIN TRAN;

    DECLARE @export_spec_id UNIQUEIDENTIFIER = (
        SELECT export_spec_id
        FROM dbo.EXPORT_SPEC
        WHERE spec_name = @spec_name
          AND spec_version = @spec_version
    );

    IF @export_spec_id IS NULL
    BEGIN
        SET @export_spec_id = @preferred_export_spec_id;

        INSERT INTO dbo.EXPORT_SPEC (export_spec_id, spec_name, spec_version, row_length)
        VALUES (@export_spec_id, @spec_name, @spec_version, @row_length);
    END
    ELSE
    BEGIN
        UPDATE dbo.EXPORT_SPEC
        SET row_length = @row_length
        WHERE export_spec_id = @export_spec_id;
    END;

    MERGE dbo.VALUE_DOMAIN AS target
    USING @domains AS source
      ON target.domain_type = source.domain_type
     AND (
          (target.raw_spec = source.raw_spec)
          OR (target.raw_spec IS NULL AND source.raw_spec IS NULL)
     )
    WHEN NOT MATCHED THEN
        INSERT (domain_id, domain_type, raw_spec)
        VALUES (source.domain_id, source.domain_type, source.raw_spec);

    INSERT INTO dbo.DOMAIN_ENUM_VALUE (domain_enum_value_id, domain_id, code, meaning)
    SELECT enum_value.domain_enum_value_id, domain.domain_id, enum_value.code, enum_value.meaning
    FROM dbo.VALUE_DOMAIN domain
    JOIN @domain_enum_values enum_value
      ON domain.domain_type = enum_value.domain_type
     AND domain.raw_spec = enum_value.raw_spec
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.DOMAIN_ENUM_VALUE existing
        WHERE existing.domain_id = domain.domain_id
          AND existing.code = enum_value.code
    );

    DELETE mapping_rule
    FROM dbo.MAPPING_RULE mapping_rule
    JOIN dbo.MAPPING_SET mapping_set
      ON mapping_set.mapping_set_id = mapping_rule.mapping_set_id
    WHERE mapping_set.export_spec_id = @export_spec_id;

    DELETE FROM dbo.EXPORT_FIELD
    WHERE export_spec_id = @export_spec_id;

    INSERT INTO dbo.EXPORT_FIELD (
        export_field_id,
        export_spec_id,
        domain_id,
        field_order,
        question_code,
        field_name,
        start_pos,
        end_pos,
        description,
        values_spec_raw
    )
    SELECT
        CONVERT(UNIQUEIDENTIFIER, CONCAT(
            N'29750000-0000-0000-0003-00000001',
            RIGHT(CONCAT(N'0000', CONVERT(NVARCHAR(10), seeded.field_order)), 4)
        )),
        @export_spec_id,
        domain.domain_id,
        seeded.field_order,
        NULLIF(RTRIM(source_field.field_code), N''),
        seeded.field_name,
        seeded.start_pos,
        seeded.end_pos,
        source_field.question,
        seeded.values_spec_raw
    FROM @fields seeded
    JOIN dbo.FIELD source_field
      ON source_field.field_name = seeded.field_name
    JOIN dbo.VALUE_DOMAIN domain
      ON domain.domain_type = seeded.domain_type
     AND (
          (domain.raw_spec = seeded.domain_raw_spec)
          OR (domain.raw_spec IS NULL AND seeded.domain_raw_spec IS NULL)
     );

    DECLARE @mapping_set_id UNIQUEIDENTIFIER = (
        SELECT mapping_set_id
        FROM dbo.MAPPING_SET
        WHERE export_spec_id = @export_spec_id
          AND mapping_version = @mapping_version
          AND (
              form_version_observed = @form_version_observed
              OR (form_version_observed IS NULL AND @form_version_observed IS NULL)
          )
    );

    IF @mapping_set_id IS NULL
    BEGIN
        SET @mapping_set_id = @preferred_mapping_set_id;

        INSERT INTO dbo.MAPPING_SET (
            mapping_set_id,
            export_spec_id,
            form_version_observed,
            mapping_name,
            mapping_version
        )
        VALUES (
            @mapping_set_id,
            @export_spec_id,
            @form_version_observed,
            @mapping_name,
            @mapping_version
        );
    END
    ELSE
    BEGIN
        UPDATE dbo.MAPPING_SET
        SET mapping_name = @mapping_name,
            form_version_observed = @form_version_observed
        WHERE mapping_set_id = @mapping_set_id;
    END;

    DELETE FROM dbo.MAPPING_RULE
    WHERE mapping_set_id = @mapping_set_id;

    INSERT INTO dbo.MAPPING_RULE (
        mapping_rule_id,
        mapping_set_id,
        export_field_id,
        source_expression,
        transform_pipeline,
        default_value,
        pad_rule
    )
    SELECT
        CONVERT(UNIQUEIDENTIFIER, CONCAT(
            N'29750000-0000-0000-0003-00000002',
            RIGHT(CONCAT(N'0000', CONVERT(NVARCHAR(10), seeded.field_order)), 4)
        )),
        @mapping_set_id,
        export_field.export_field_id,
        COALESCE(
            seeded.source_expression,
            CONCAT(N'RESP_FIELD:', seeded.field_name)
        ),
        seeded.transform_pipeline,
        seeded.default_value,
        seeded.pad_rule
    FROM @fields seeded
    JOIN dbo.EXPORT_FIELD export_field
      ON export_field.export_spec_id = @export_spec_id
     AND export_field.field_name = seeded.field_name;

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRAN;

    THROW;
END CATCH;

/* Smoke checks for the target catalog only. */
DECLARE @target_export_spec_id UNIQUEIDENTIFIER = (
    SELECT export_spec_id
    FROM dbo.EXPORT_SPEC
    WHERE spec_name = @spec_name
      AND spec_version = @spec_version
);

SELECT
    spec.export_spec_id,
    spec.spec_name,
    spec.spec_version,
    spec.row_length,
    COUNT(export_field.export_field_id) AS export_fields
FROM dbo.EXPORT_SPEC spec
LEFT JOIN dbo.EXPORT_FIELD export_field
  ON export_field.export_spec_id = spec.export_spec_id
WHERE spec.export_spec_id = @target_export_spec_id
GROUP BY spec.export_spec_id, spec.spec_name, spec.spec_version, spec.row_length;

SELECT
    mapping_set.mapping_set_id,
    mapping_set.mapping_name,
    mapping_set.mapping_version,
    COUNT(mapping_rule.mapping_rule_id) AS mapping_rules
FROM dbo.MAPPING_SET mapping_set
LEFT JOIN dbo.MAPPING_RULE mapping_rule
  ON mapping_rule.mapping_set_id = mapping_set.mapping_set_id
WHERE mapping_set.export_spec_id = @target_export_spec_id
GROUP BY mapping_set.mapping_set_id, mapping_set.mapping_name, mapping_set.mapping_version;

SELECT
    COUNT(*) AS fields,
    SUM(CASE WHEN mapping_rule.mapping_rule_id IS NULL THEN 1 ELSE 0 END) AS fields_missing_rules
FROM dbo.EXPORT_FIELD export_field
LEFT JOIN dbo.MAPPING_SET mapping_set
  ON mapping_set.export_spec_id = export_field.export_spec_id
 AND mapping_set.mapping_version = @mapping_version
LEFT JOIN dbo.MAPPING_RULE mapping_rule
  ON mapping_rule.mapping_set_id = mapping_set.mapping_set_id
 AND mapping_rule.export_field_id = export_field.export_field_id
WHERE export_field.export_spec_id = @target_export_spec_id;
