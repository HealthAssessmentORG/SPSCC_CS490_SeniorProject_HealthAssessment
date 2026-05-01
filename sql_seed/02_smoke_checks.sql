/* sql/02_smoke_checks.sql */

/* 1) Counts */
SELECT
  (SELECT COUNT(*) FROM dbo.[RUN]) AS runs,
  (SELECT COUNT(*) FROM dbo.DEPLOYER) AS deployers,
  (SELECT COUNT(*) FROM dbo.ASSESSMENT) AS assessments,
  (SELECT COUNT(*) FROM dbo.RESPONSE) AS responses,
  (SELECT COUNT(*) FROM dbo.PROVIDER_REVIEW) AS provider_reviews,
  (SELECT COUNT(*) FROM dbo.EXPORT_SPEC) AS export_specs,
  (SELECT COUNT(*) FROM dbo.EXPORT_FIELD) AS export_fields,
  (SELECT COUNT(*) FROM dbo.MAPPING_SET) AS mapping_sets,
  (SELECT COUNT(*) FROM dbo.MAPPING_RULE) AS mapping_rules;

/* 2) Ensure we really have 20 export fields and one rule each */
SELECT
  ef.export_spec_id,
  COUNT(*) AS fields,
  SUM(CASE WHEN mr.mapping_rule_id IS NULL THEN 1 ELSE 0 END) AS fields_missing_rules
FROM dbo.EXPORT_FIELD ef
LEFT JOIN dbo.MAPPING_RULE mr
  ON mr.export_field_id = ef.export_field_id
GROUP BY ef.export_spec_id;

/* 3) Show 1 assessment's “export values inputs” */
DECLARE @one UNIQUEIDENTIFIER =
  (SELECT TOP (1) assessment_id FROM dbo.ASSESSMENT ORDER BY NEWID());

SELECT
  a.assessment_id,
  a.form_type_observed,
  a.form_version_observed,
  a.event_date,
  d.dod_id,
  pr.provider_name,
  pr.certify_date,
  pr.provider_title,
  pr.provider_signature
FROM dbo.ASSESSMENT a
JOIN dbo.DEPLOYER d ON d.deployer_id = a.deployer_id
LEFT JOIN dbo.PROVIDER_REVIEW pr ON pr.assessment_id = a.assessment_id
WHERE a.assessment_id = @one;

SELECT question_code, field_name, value_norm
FROM dbo.RESPONSE
WHERE assessment_id = @one
ORDER BY question_code, field_name;
