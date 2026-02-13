/* sql/01_seed_prealpha_20fields_100.sql */

DECLARE @seed INT = 12345;
DECLARE @target_record_count INT = 100;

DECLARE @run_id UNIQUEIDENTIFIER = NEWID();
DECLARE @export_spec_id UNIQUEIDENTIFIER = NEWID();
DECLARE @mapping_set_id UNIQUEIDENTIFIER = NEWID();

INSERT INTO dbo.[RUN] (run_id, run_name, seed, target_record_count, status)
VALUES (@run_id, N'prealpha_100', @seed, @target_record_count, N'running');

/* --- Export spec (5172 chars) --- */
INSERT INTO dbo.EXPORT_SPEC (export_spec_id, spec_name, spec_version, row_length)
VALUES (@export_spec_id, N'DD2975_like', N'prealpha_20', 5172);

/* --- Value domains --- */
DECLARE @dom_text UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_dodid10 UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_yyyymmdd UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_sex UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_service UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_component UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_paygrade UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_yn UNIQUEIDENTIFIER = NEWID();
DECLARE @dom_provider_title UNIQUEIDENTIFIER = NEWID();

INSERT INTO dbo.VALUE_DOMAIN (domain_id, domain_type, raw_spec) VALUES
(@dom_text,           N'TEXT',          N'free text'),
(@dom_dodid10,        N'DODID10',        N'^\d{10}$'),
(@dom_yyyymmdd,       N'DATE_YYYYMMDD',  N'YYYYMMDD (112)'),
(@dom_sex,            N'ENUM_SEX',       N'M=Male, F=Female'),
(@dom_service,        N'ENUM_SERVICE',   N'see spec raw'),
(@dom_component,      N'ENUM_COMPONENT', N'A/N/R/X'),
(@dom_paygrade,       N'ENUM_PAY_GRADE', N'see spec raw'),
(@dom_yn,             N'ENUM_YN',        N'Y/N'),
(@dom_provider_title, N'ENUM_PROV_TITLE',N'1..8, blank');

INSERT INTO dbo.DOMAIN_ENUM_VALUE (domain_enum_value_id, domain_id, code, meaning) VALUES
(NEWID(), @dom_sex, N'M', N'Male'),
(NEWID(), @dom_sex, N'F', N'Female'),
(NEWID(), @dom_yn,  N'Y', N'Yes/Checked'),
(NEWID(), @dom_yn,  N'N', N'No/Not checked'),
(NEWID(), @dom_provider_title, N'1', N'MD or DO'),
(NEWID(), @dom_provider_title, N'2', N'PA'),
(NEWID(), @dom_provider_title, N'3', N'Nurse Practitioner'),
(NEWID(), @dom_provider_title, N'4', N'Adv Practice Nurse'),
(NEWID(), @dom_provider_title, N'5', N'IDMT'),
(NEWID(), @dom_provider_title, N'6', N'IDC'),
(NEWID(), @dom_provider_title, N'7', N'IDHS'),
(NEWID(), @dom_provider_title, N'8', N'SFMS');

/* --- Export fields (20-field slice) --- */
INSERT INTO dbo.EXPORT_FIELD (
    export_field_id, export_spec_id, domain_id, field_order, question_code, field_name,
    start_pos, end_pos, description, values_spec_raw
)
SELECT NEWID(), @export_spec_id, v.domain_id, v.field_order, v.question_code, v.field_name,
       v.start_pos, v.end_pos, v.description, v.values_spec_raw
FROM (VALUES
    (1,  NULL,    N'FORM_TYPE',       1,    5,    N'Type of Form',                    N'PRE',                                  @dom_text),
    (2,  NULL,    N'FORM_VERSION',    6,   20,    N'DoD Form Version',                N'DD2795_202006',                        @dom_text),
    (3,  N'DEM',  N'LNAME',          21,   45,    N'Last Name',                       N'Text Field',                            @dom_text),
    (4,  N'DEM',  N'FNAME',          46,   70,    N'First Name',                      N'Text Field',                            @dom_text),
    (5,  N'DEM',  N'MI',             71,   71,    N'Middle Initial',                  N'Text Field',                            @dom_text),
    (6,  N'DEM',  N'DODID',          72,   81,    N'DoD ID number (formerly EDIPI)',  N'9999999999',                            @dom_dodid10),
    (7,  N'DEM',  N'D_EVENT',        82,   89,    N'Today''s Date (date on form)',    N'YYYYMMDD',                              @dom_yyyymmdd),
    (8,  N'DEM',  N'DOB',            90,   97,    N'Date of Birth',                   N'YYYYMMDD',                              @dom_yyyymmdd),
    (9,  N'DEM',  N'SEX',            98,   98,    N'Sex',                             N'M=Male, F=Female',                      @dom_sex),
    (10, N'DEM',  N'FORM_SERVICE',   99,   99,    N'Service Branch',                  N'see spec raw',                          @dom_service),
    (11, N'DEM',  N'FORM_COMPONENT', 125, 127,    N'Component',                       N'A=Active Duty, N=National Guard, R=Reserves, X=Civilian Gov Employee', @dom_component),
    (12, N'DEM',  N'GRADE',          128, 130,    N'Pay Grade',                       N'see spec raw',                          @dom_paygrade),
    (13, N'DEM',  N'UNIT_NAME',      156, 230,    N'Unit Name',                       N'Text Field',                            @dom_text),
    (14, N'DEM',  N'UNIT_LOC',       231, 305,    N'Duty Station/Location',           N'Text Field',                            @dom_text),
    (15, N'DEM',  N'EMAIL',          366, 440,    N'Current Email',                   N'Text Field',                            @dom_text),

    (16, N'HP16', N'TRICARE',        5008, 5008,  N'TRICARE PROVIDER',                N'Y=Checked, N=Not checked',             @dom_yn),
    (17, N'HP16', N'PROVIDER_NAME',  5113, 5162,  N'Provider''s Name',                N'Text Field',                           @dom_text),
    (18, N'HP16', N'CERTIFY_DATE',   5163, 5170,  N'Date Certified',                  N'YYYYMMDD',                             @dom_yyyymmdd),
    (19, N'HP16', N'PROVIDER_TITLE', 5171, 5171,  N'Provider''s title',               N'1=MD or DO, 2=PA, 3=Nurse Practitioner, 4=Adv Practice Nurse, 5=IDMT, 6=IDC, 7=IDHS, 8=SFMS, blank=missing', @dom_provider_title),
    (20, N'HP16', N'CERT_PROVIDER',  5172, 5172,  N'Provider''s Signature',           N'Provider Signature, ""Y"", ""N""',     @dom_yn)
) AS v(field_order, question_code, field_name, start_pos, end_pos, description, values_spec_raw, domain_id);

/* --- Mapping set + rules (string expressions your compiler can interpret) --- */
INSERT INTO dbo.MAPPING_SET (mapping_set_id, export_spec_id, form_version_observed, mapping_name, mapping_version)
VALUES (@mapping_set_id, @export_spec_id, N'DD2795_202006', N'prealpha_20', 1);

INSERT INTO dbo.MAPPING_RULE (
    mapping_rule_id, mapping_set_id, export_field_id,
    source_expression, transform_pipeline, default_value, pad_rule
)
SELECT
    NEWID(), @mapping_set_id, ef.export_field_id,
    CASE ef.field_name
        WHEN N'FORM_TYPE'       THEN N'COL:ASSESSMENT.form_type_observed'
        WHEN N'FORM_VERSION'    THEN N'COL:ASSESSMENT.form_version_observed'
        WHEN N'DODID'           THEN N'COL:DEPLOYER.dod_id'
        WHEN N'D_EVENT'         THEN N'COL:ASSESSMENT.event_date'
        WHEN N'PROVIDER_NAME'   THEN N'COL:PROVIDER_REVIEW.provider_name'
        WHEN N'CERTIFY_DATE'    THEN N'COL:PROVIDER_REVIEW.certify_date'
        WHEN N'PROVIDER_TITLE'  THEN N'COL:PROVIDER_REVIEW.provider_title'
        WHEN N'CERT_PROVIDER'   THEN N'COL:PROVIDER_REVIEW.provider_signature'
        ELSE CONCAT(N'RESP:', COALESCE(ef.question_code, N''), N':', ef.field_name)
    END,
    CASE
        WHEN ef.field_name IN (N'D_EVENT', N'DOB', N'CERTIFY_DATE') THEN N'date:yyyymmdd'
        ELSE N'trim'
    END,
    N'',
    N'pad:right:space'
FROM dbo.EXPORT_FIELD ef
WHERE ef.export_spec_id = @export_spec_id;

/* --- Deployer pool (10 unique 10-digit DoD IDs) --- */
WITH n AS (
    SELECT value AS n
    FROM GENERATE_SERIES(1, 10)
)
INSERT INTO dbo.DEPLOYER (deployer_id, dod_id)
SELECT NEWID(),
       RIGHT('0000000000' + CONVERT(VARCHAR(20), 1000000000 + n.n), 10)
FROM n;

/* --- 100 assessments --- */
WITH a AS (
    SELECT value AS ordinal
    FROM GENERATE_SERIES(1, @target_record_count)
),
d AS (
    SELECT deployer_id, ROW_NUMBER() OVER (ORDER BY deployer_id) AS rn
    FROM dbo.DEPLOYER
)
INSERT INTO dbo.ASSESSMENT (
    assessment_id, run_id, deployer_id,
    form_type_observed, form_version_observed, event_date
)
SELECT
    NEWID(),
    @run_id,
    d.deployer_id,
    N'PRE',
    N'DD2795_202006',
    DATEADD(DAY, -(a.ordinal % 365), CAST(SYSUTCDATETIME() AS DATE))
FROM a
JOIN d ON d.rn = 1 + ((a.ordinal - 1) % 10);

/* --- Responses: deployer DEM fields + reviewer TRICARE --- */
;WITH A AS (
    SELECT assessment_id, event_date
    FROM dbo.ASSESSMENT
    WHERE run_id = @run_id
),
T AS (
    SELECT *
    FROM (VALUES
        (N'DEM',  N'LNAME'),
        (N'DEM',  N'FNAME'),
        (N'DEM',  N'MI'),
        (N'DEM',  N'DOB'),
        (N'DEM',  N'SEX'),
        (N'DEM',  N'FORM_SERVICE'),
        (N'DEM',  N'FORM_COMPONENT'),
        (N'DEM',  N'GRADE'),
        (N'DEM',  N'UNIT_NAME'),
        (N'DEM',  N'UNIT_LOC'),
        (N'DEM',  N'EMAIL'),
        (N'HP16', N'TRICARE')
    ) v(question_code, field_name)
)
INSERT INTO dbo.RESPONSE (response_id, assessment_id, question_code, field_name, value_raw, value_norm)
SELECT
    NEWID(),
    A.assessment_id,
    T.question_code,
    T.field_name,
    /* value_raw */
    CASE T.field_name
        WHEN N'LNAME' THEN CONCAT(N'LAST', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':L')))), 6))
        WHEN N'FNAME' THEN CONCAT(N'FIRST', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':F')))), 6))
        WHEN N'MI'    THEN NCHAR(UNICODE(N'A') + (ABS(CHECKSUM(CONCAT(A.assessment_id, N':MI'))) % 26))
        WHEN N'DOB'   THEN CONVERT(CHAR(8),
                            DATEADD(DAY,
                                -(ABS(CHECKSUM(CONCAT(A.assessment_id, N':DOB'))) % 3650),
                                DATEADD(YEAR, -18 - (ABS(CHECKSUM(CONCAT(A.assessment_id, N':AGE'))) % 25), A.event_date)
                            ), 112)
        WHEN N'SEX'   THEN CASE WHEN (ABS(CHECKSUM(CONCAT(A.assessment_id, N':SEX'))) % 2) = 0 THEN N'M' ELSE N'F' END
        WHEN N'FORM_SERVICE' THEN
            SUBSTRING(N'FANMCXPD', 1 + (ABS(CHECKSUM(CONCAT(A.assessment_id, N':SVC'))) % 8), 1)
        WHEN N'FORM_COMPONENT' THEN
            SUBSTRING(N'ANRX', 1 + (ABS(CHECKSUM(CONCAT(A.assessment_id, N':CMP'))) % 4), 1)
        WHEN N'GRADE' THEN
            CASE (ABS(CHECKSUM(CONCAT(A.assessment_id, N':GR'))) % 6)
                WHEN 0 THEN N'E04' WHEN 1 THEN N'E05' WHEN 2 THEN N'E06'
                WHEN 3 THEN N'O02' WHEN 4 THEN N'W02' ELSE N'ZZZ'
            END
        WHEN N'UNIT_NAME' THEN CONCAT(N'UNIT_', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':UN')))), 6))
        WHEN N'UNIT_LOC'  THEN CONCAT(N'BASE_', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':UL')))), 6))
        WHEN N'EMAIL'     THEN CONCAT(N'user', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':EM')))), 6), N'@example.mil')
        WHEN N'TRICARE'   THEN CASE WHEN (ABS(CHECKSUM(CONCAT(A.assessment_id, N':TRI'))) % 2) = 0 THEN N'Y' ELSE N'N' END
        ELSE NULL
    END,
    /* value_norm (for now: same as raw) */
    CASE T.field_name
        WHEN N'EMAIL' THEN LOWER(CONCAT(N'user', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':EM')))), 6), N'@example.mil'))
        ELSE
            CASE T.field_name
                WHEN N'LNAME' THEN CONCAT(N'LAST', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':L')))), 6))
                WHEN N'FNAME' THEN CONCAT(N'FIRST', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':F')))), 6))
                WHEN N'MI'    THEN NCHAR(UNICODE(N'A') + (ABS(CHECKSUM(CONCAT(A.assessment_id, N':MI'))) % 26))
                WHEN N'DOB'   THEN CONVERT(CHAR(8),
                                    DATEADD(DAY,
                                        -(ABS(CHECKSUM(CONCAT(A.assessment_id, N':DOB'))) % 3650),
                                        DATEADD(YEAR, -18 - (ABS(CHECKSUM(CONCAT(A.assessment_id, N':AGE'))) % 25), A.event_date)
                                    ), 112)
                WHEN N'SEX'   THEN CASE WHEN (ABS(CHECKSUM(CONCAT(A.assessment_id, N':SEX'))) % 2) = 0 THEN N'M' ELSE N'F' END
                WHEN N'FORM_SERVICE' THEN SUBSTRING(N'FANMCXPD', 1 + (ABS(CHECKSUM(CONCAT(A.assessment_id, N':SVC'))) % 8), 1)
                WHEN N'FORM_COMPONENT' THEN SUBSTRING(N'ANRX', 1 + (ABS(CHECKSUM(CONCAT(A.assessment_id, N':CMP'))) % 4), 1)
                WHEN N'GRADE' THEN
                    CASE (ABS(CHECKSUM(CONCAT(A.assessment_id, N':GR'))) % 6)
                        WHEN 0 THEN N'E04' WHEN 1 THEN N'E05' WHEN 2 THEN N'E06'
                        WHEN 3 THEN N'O02' WHEN 4 THEN N'W02' ELSE N'ZZZ'
                    END
                WHEN N'UNIT_NAME' THEN CONCAT(N'UNIT_', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':UN')))), 6))
                WHEN N'UNIT_LOC'  THEN CONCAT(N'BASE_', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(A.assessment_id, N':UL')))), 6))
                WHEN N'TRICARE'   THEN CASE WHEN (ABS(CHECKSUM(CONCAT(A.assessment_id, N':TRI'))) % 2) = 0 THEN N'Y' ELSE N'N' END
                ELSE NULL
            END
    END
FROM A
CROSS JOIN T;

/* --- Provider review rows (4 reviewer fields) --- */
INSERT INTO dbo.PROVIDER_REVIEW (assessment_id, provider_name, certify_date, provider_title, provider_signature)
SELECT
    a.assessment_id,
    CONCAT(N'Dr ', RIGHT(CONVERT(VARCHAR(12), ABS(CHECKSUM(CONCAT(a.assessment_id, N':PN')))), 6)),
    a.event_date,
    CONVERT(NVARCHAR(10), 1 + (ABS(CHECKSUM(CONCAT(a.assessment_id, N':PT'))) % 8)), /* 1..8 */
    CASE WHEN (ABS(CHECKSUM(CONCAT(a.assessment_id, N':SIG'))) % 2) = 0 THEN N'Y' ELSE N'N' END
FROM dbo.ASSESSMENT a
WHERE a.run_id = @run_id;

/* Finish run */
UPDATE dbo.[RUN]
SET status = N'finished',
    finished_at = SYSUTCDATETIME()
WHERE run_id = @run_id;
