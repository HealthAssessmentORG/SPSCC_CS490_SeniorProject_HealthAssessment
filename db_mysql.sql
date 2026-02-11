-- MySQL 8+ DDL
-- Notes:
--  * Should be compatible with the ANSI design in db_standard.sql
--  * CHECK constraints are enforced in MySQL 8.0.16+ but in older versions they parse but ignore them.

CREATE TABLE dd2795_pre_response (
    response_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    form_type      CHAR(5)      NOT NULL DEFAULT 'PRE',
    form_version   VARCHAR(15)  NOT NULL DEFAULT 'DD2795_202006',

    lname          VARCHAR(25),
    fname          VARCHAR(25),
    mi             CHAR(1),

    dodid          CHAR(10),
    d_event        CHAR(8),
    dob            CHAR(8),
    sex            CHAR(1),
    form_service   CHAR(1),

    service_other  VARCHAR(25),
    form_component CHAR(3),
    grade          CHAR(3),
    grade_other    VARCHAR(25),

    unit_name      VARCHAR(75),
    unit_loc       VARCHAR(75),
    phone          VARCHAR(20),
    cell           VARCHAR(20),
    dsn            VARCHAR(20),
    email          VARCHAR(75),

    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (response_id),

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
) ENGINE=InnoDB;

CREATE INDEX ix_dd2795_pre_dodid ON dd2795_pre_response (dodid);
CREATE INDEX ix_dd2795_pre_name  ON dd2795_pre_response (lname, fname);
CREATE INDEX ix_dd2795_pre_event ON dd2795_pre_response (d_event);
