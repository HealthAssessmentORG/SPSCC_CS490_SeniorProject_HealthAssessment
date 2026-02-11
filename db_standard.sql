-- SQL Standard, first 20 fields (ORDER 1..20)
-- Note: D_EVENT and DOB are stored as CHAR(8) in YYYYMMDD format (as in the export).

DROP TABLE IF EXISTS dd2795_pre_response;
CREATE TABLE dd2795_pre_response (
    response_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- 1-2: Form metadata
    form_type     CHAR(5)      NOT NULL DEFAULT 'PRE',           -- ORDER 1: FORM_TYPE
    form_version  VARCHAR(15)  NOT NULL DEFAULT 'DD2795_202006', -- ORDER 2: FORM_VERSION

    -- 3-5: Name
    lname         VARCHAR(25),                                   -- ORDER 3: LNAME
    fname         VARCHAR(25),                                   -- ORDER 4: FNAME
    mi            CHAR(1),                                       -- ORDER 5: MI

    -- 6-10: Identifiers & demographics
    dodid         CHAR(10),                                      -- ORDER 6: DODID (stored as char to preserve leading zeros)
    d_event       CHAR(8),                                       -- ORDER 7: D_EVENT (YYYYMMDD)
    dob           CHAR(8),                                       -- ORDER 8: DOB (YYYYMMDD)
    sex           CHAR(1),                                       -- ORDER 9: SEX
    form_service  CHAR(1),                                       -- ORDER 10: FORM_SERVICE

    -- 11-14: Service/component/grade + "other" free-text
    service_other  VARCHAR(25),                                  -- ORDER 11: SERVICE_OTHER
    form_component CHAR(3),                                      -- ORDER 12: FORM_COMPONENT (spec length=3; codes are A/N/R/X)
    grade          CHAR(3),                                      -- ORDER 13: GRADE
    grade_other    VARCHAR(25),                                  -- ORDER 14: GRADE_OTHER

    -- 15-20: Unit & contact
    unit_name     VARCHAR(75),                                   -- ORDER 15: UNIT_NAME
    unit_loc      VARCHAR(75),                                   -- ORDER 16: UNIT_LOC
    phone         VARCHAR(20),                                   -- ORDER 17: PHONE
    cell          VARCHAR(20),                                   -- ORDER 18: CELL
    dsn           VARCHAR(20),                                   -- ORDER 19: DSN
    email         VARCHAR(75),                                   -- ORDER 20: EMAIL

    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Validity checks (enforcement varies by database)
    CONSTRAINT chk_sex            CHECK (sex IS NULL OR sex IN ('M','F')),
    CONSTRAINT chk_form_service   CHECK (form_service IS NULL OR form_service IN ('A','C','D','F','M','N','P','X')),
    CONSTRAINT chk_form_component CHECK (form_component IS NULL OR TRIM(form_component) IN ('A','N','R','X')),
    CONSTRAINT chk_grade          CHECK (grade IS NULL OR grade IN (
        'E01','E02','E03','E04','E05','E06','E07','E08','E09',
        'O01','O02','O03','O04','O05','O06','O07','O08','O09','O10',
        'W01','W02','W03','W04','W05','ZZZ'
    )),
    CONSTRAINT chk_dodid_len    CHECK (dodid IS NULL OR CHAR_LENGTH(dodid) = 10),
    CONSTRAINT chk_d_event_len  CHECK (d_event IS NULL OR CHAR_LENGTH(d_event) = 8),
    CONSTRAINT chk_dob_len      CHECK (dob IS NULL OR CHAR_LENGTH(dob) = 8)
);

-- Helpers for common lookups
CREATE INDEX ix_dd2795_pre_dodid ON dd2795_pre_response (dodid);
CREATE INDEX ix_dd2795_pre_name  ON dd2795_pre_response (lname, fname);
CREATE INDEX ix_dd2795_pre_event ON dd2795_pre_response (d_event);
